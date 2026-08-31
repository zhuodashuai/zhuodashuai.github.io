#!/usr/bin/env python3
"""Build the compact, browser-friendly ECDICT subset used by the wordbook.

The source CSV is deliberately not checked into this repository.  Download or
copy ECDICT's ``ecdict.csv`` locally, then run this script.  Selection is
deterministic: all tagged/high-frequency phrases are retained, explicitly
tested terms are retained, and the remaining slots are filled by dictionary
importance and corpus frequency.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


SCHEMA_VERSION = 1
DEFAULT_LIMIT = 7500
EXAM_TAGS = {"zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts", "gre"}

# ECDICT intentionally records some common misspellings.  They are useful in a
# full reference dictionary, but unsafe in an exact-first learning workflow:
# an input such as ``accomodate`` must reach the correction rule rather than be
# treated as an authoritative headword.
KNOWN_MISSPELLINGS = {
    "accomodate", "definately", "enviroment", "neccessary", "recieve",
    "seperate", "wierd",
}

# This is both a coverage lock for the provider tests and a useful cross-section
# of ordinary words, polysemes, inflections, British spelling and phrasal verbs.
REQUIRED_TERMS = {
    "24/7", "accept", "accommodate", "achieve", "actually", "advice", "affect",
    "allow", "analyze", "answer",
    "appear", "apply", "argument", "arrive", "article", "available", "avoid",
    "bank", "bat", "beijing", "bear", "become", "begin", "believe", "board",
    "book", "break", "break down", "bring", "bring about", "build", "business",
    "by and large", "c++", "call", "can't", "carry", "carry on", "carry out",
    "centre", "change", "charge", "choose", "colour", "come", "common",
    "come across", "complete", "consider", "continue", "correct", "covid-19",
    "create", "current", "date",
    "decide", "definitely", "describe", "develop", "different", "difficult",
    "e.g.", "education", "effect", "efficient", "environment", "example",
    "experience", "explain",
    "fact", "fair", "feel", "file", "find", "follow", "form", "friend",
    "figure out", "get", "get along with", "give", "give up", "good",
    "government", "great", "happen", "help",
    "hip", "important", "include", "information", "issue", "jab", "keep",
    "know", "language", "learn", "leave", "life", "light", "look", "look after",
    "iphone", "make", "match", "mean", "meaning", "necessary", "need",
    "new york", "number", "offer",
    "people", "ph.d.", "place", "plant", "point", "point out", "possible",
    "problem", "provide",
    "public", "put", "put up with", "question", "realise", "receive", "remember",
    "research", "right", "run", "run into", "say", "school", "seal", "separate",
    "set", "set up",
    "show", "source", "spring", "start", "student", "study", "support", "system",
    "take", "take off", "take part in", "term", "test", "thing", "think", "time",
    "translate", "turn down", "u.s.", "understand", "university", "use", "watch",
    "way", "weird", "word", "work",
    "world", "write",
}

POS_NAMES = {
    "n": "noun",
    "v": "verb",
    "vi": "verb",
    "vt": "verb",
    "a": "adjective",
    "adj": "adjective",
    "ad": "adverb",
    "adv": "adverb",
    "prep": "preposition",
    "pron": "pronoun",
    "conj": "conjunction",
    "num": "number",
    "int": "interjection",
}

EDITORIAL_OVERRIDES = {
    "efficient": {
        "part_of_speech": "adjective",
        "meaning": "高效的；效率高的；有效率的",
    },
    "actually": {
        "part_of_speech": "adverb",
        "meaning": "实际上；其实；事实上",
    },
    "analyze": {
        "part_of_speech": "verb",
        "meaning": "分析；解析；研究",
    },
    "hip": {
        "part_of_speech": "noun",
        "meaning": "n. 髋部；臀部\nadj. 时髦的；消息灵通的",
        "definition": (
            "n. either side of the body below the waist and above the thigh\n"
            "n. the joint where the thigh bone meets the pelvis\n"
            "adj. fashionable or up-to-date"
        ),
    },
    "bank": {
        "part_of_speech": "noun",
        "meaning": "n. 银行；银行机构\nn. 河岸；堤岸",
    },
    "current": {
        "meaning": "adj. 当前的；目前的；现行的\nn. 电流；水流；气流；潮流",
    },
    "fair": {
        "meaning": "adj. 公平的；公正的\nn. 集市；博览会",
    },
    "mean": {
        "meaning": "v. 意思是；意味着\nn. 平均数；平均值\nadj. 刻薄的；吝啬的",
    },
    "set": {
        "meaning": "v. 设置；放置\nn. 一套；一组",
    },
    "board": {
        "meaning": "n. 木板；板；董事会；委员会\nv. 登上；上车；上船",
    },
    "look after": {
        "part_of_speech": "verb",
        "meaning": "照顾；照料；负责处理",
        "definition": (
            "To care for or take care of someone or something.\n"
            "To be responsible for dealing with something."
        ),
    },
    "give up": {
        "part_of_speech": "verb",
        "meaning": "放弃；停止；认输",
        "definition": (
            "To stop trying and admit defeat.\n"
            "To stop doing or using something.\n"
            "To surrender or relinquish something."
        ),
    },
    "take off": {
        "part_of_speech": "verb",
        "meaning": "脱下；起飞；迅速成功",
        "definition": (
            "To remove an item of clothing.\n"
            "For an aircraft, to leave the ground and begin flying.\n"
            "To become successful or popular very quickly."
        ),
    },
    "run into": {
        "part_of_speech": "verb",
        "meaning": "偶遇；碰见；撞上；撞到",
        "definition": (
            "To meet someone unexpectedly.\n"
            "To collide with someone or something."
        ),
    },
    "carry out": {
        "part_of_speech": "verb",
        "meaning": "执行；实施；贯彻",
        "definition": "To perform or complete a plan, instruction, study, or task.",
    },
    "account for": {
        "part_of_speech": "verb",
        "meaning": "解释；说明原因；占；占据",
        "definition": (
            "To explain the reason for something.\n"
            "To form a particular amount or proportion of a whole."
        ),
    },
    "get along with": {
        "part_of_speech": "verb",
        "meaning": "与…相处；和…相处；进展",
        "definition": "To have a friendly or workable relationship with someone.",
    },
    "come across": {
        "part_of_speech": "verb",
        "meaning": "偶然遇到；无意中发现",
        "definition": "To meet someone or find something by chance.",
    },
    "turn down": {
        "part_of_speech": "verb",
        "meaning": "拒绝；调低；关小",
        "definition": (
            "To refuse an offer, request, or invitation.\n"
            "To reduce the level of sound, heat, light, or power."
        ),
    },
    "figure out": {
        "part_of_speech": "verb",
        "meaning": "弄明白；想出；解决",
        "definition": "To understand something or find the solution to a problem.",
    },
    "break down": {
        "part_of_speech": "verb",
        "meaning": "出故障；坏掉；崩溃；分解；拆分",
        "definition": (
            "For a machine or vehicle, to stop working.\n"
            "To divide something into smaller parts for analysis.\n"
            "To lose emotional control."
        ),
    },
    "bring about": {
        "part_of_speech": "verb",
        "meaning": "导致；引起；造成",
        "definition": "To cause something to happen.",
    },
    "point out": {
        "part_of_speech": "verb",
        "meaning": "指出；指明",
        "definition": "To draw attention to a fact or indicate something clearly.",
    },
    "rely on": {
        "part_of_speech": "verb",
        "meaning": "依赖；依靠",
        "definition": "To depend on or trust someone or something.",
    },
    "deal with": {
        "part_of_speech": "verb",
        "meaning": "处理；应对",
        "definition": "To handle, manage, or respond to a person, problem, or situation.",
    },
    "set up": {
        "part_of_speech": "verb",
        "meaning": "建立；设立；设置",
        "definition": (
            "To establish or create an organization or system.\n"
            "To arrange or prepare something for use."
        ),
    },
    "take part in": {
        "part_of_speech": "verb",
        "meaning": "参加；参与",
        "definition": "To participate in an activity or event.",
    },
    "in charge of": {
        "part_of_speech": "preposition",
        "meaning": "负责；主管",
        "definition": "Responsible for controlling, managing, or looking after something.",
    },
    "by and large": {
        "part_of_speech": "adverb",
        "meaning": "总的来说；总体而言；大体上",
        "definition": "Generally or on the whole.",
    },
    "carry on": {
        "part_of_speech": "verb",
        "meaning": "继续；坚持；进行",
    },
    "put up with": {
        "part_of_speech": "verb",
        "meaning": "忍受；容忍",
        "definition": "To tolerate an unpleasant person, thing, or situation.",
    },
    "definitely": {
        "part_of_speech": "adverb",
        "meaning": "肯定地；确实；明确地",
    },
}

# A few modern/proper/technical forms are intentionally absent from ECDICT's
# historical CSV.  They are tiny, human-reviewed additions to the generated
# core rather than machine translations.  Keys are normalized; ``word`` keeps
# the spelling/capitalization that the application must preserve.
SUPPLEMENTAL_ENTRIES = {
    "24/7": {
        "word": "24/7",
        "part_of_speech": "adverb",
        "meaning": "全天候；全天不间断；一天二十四小时、一周七天",
        "definition": "twenty-four hours a day, seven days a week",
    },
    "c++": {
        "word": "C++",
        "part_of_speech": "proper noun",
        "meaning": "C++编程语言；C++语言",
        "definition": "a general-purpose programming language",
    },
    "covid-19": {
        "word": "COVID-19",
        "part_of_speech": "proper noun",
        "meaning": "新冠肺炎；2019冠状病毒病",
        "definition": "the coronavirus disease first identified in 2019",
    },
    "beijing": {
        "word": "Beijing",
        "part_of_speech": "proper noun",
        "meaning": "北京",
        "definition": "the capital city of China",
    },
    "iphone": {
        "word": "iPhone",
        "part_of_speech": "proper noun",
        "meaning": "苹果手机；智能手机",
        "definition": "a smartphone made by Apple",
    },
    "e.g.": {
        "word": "e.g.",
        "part_of_speech": "abbreviation",
        "meaning": "例如；举例来说",
        "definition": "for example",
    },
    "ph.d.": {
        "word": "Ph.D.",
        "part_of_speech": "abbreviation",
        "meaning": "博士学位；哲学博士",
        "definition": "Doctor of Philosophy; a doctoral degree",
    },
    "new york": {
        "word": "New York",
        "part_of_speech": "proper noun",
        "meaning": "纽约",
        "definition": "a state and city name in the United States",
    },
    "u.s.": {
        "word": "U.S.",
        "part_of_speech": "abbreviation",
        "meaning": "美国",
        "definition": "the United States",
    },
    "can't": {
        "word": "can't",
        "part_of_speech": "contraction",
        "meaning": "不能；无法",
        "definition": "cannot",
    },
}


def normalize_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def decode_ecdict(value: str | None) -> str:
    """Decode the slash escapes used by ECDICT's CSV helper."""

    if not value:
        return ""
    output: list[str] = []
    index = 0
    while index < len(value):
        character = value[index]
        if character == "\\" and index + 1 < len(value):
            escaped = value[index + 1]
            if escaped == "n":
                output.append("\n")
            elif escaped == "r":
                output.append("\r")
            elif escaped == "\\":
                output.append("\\")
            else:
                output.extend(("\\", escaped))
            index += 2
            continue
        output.append(character)
        index += 1
    return "".join(output)


def compact_lines(value: str | None, *, maximum_lines: int, maximum_total: int) -> str:
    lines: list[str] = []
    for raw_line in decode_ecdict(value).splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line or line.startswith("[网络]"):
            continue
        line = line[:280].rstrip()
        if line not in lines:
            lines.append(line)
        if len(lines) >= maximum_lines:
            break
    result = "\n".join(lines)
    return result[:maximum_total].rstrip()


def integer(row: dict[str, str], name: str) -> int:
    try:
        return max(0, int(row.get(name) or 0))
    except (TypeError, ValueError):
        return 0


def primary_part_of_speech(row: dict[str, str], definition: str, meaning: str) -> str:
    raw_pos = (row.get("pos") or "").strip().lower()
    if raw_pos:
        token = re.split(r"[:/ ]", raw_pos, maxsplit=1)[0]
        if token in POS_NAMES:
            return POS_NAMES[token]
    for text in (definition, meaning):
        match = re.match(r"\s*([a-z]{1,5})\.", text, re.IGNORECASE)
        if match and match.group(1).lower() in POS_NAMES:
            return POS_NAMES[match.group(1).lower()]
    return ""


def forms_from_exchange(value: str | None) -> list[str]:
    accepted = {"s", "p", "d", "i", "3", "r", "t"}
    forms: list[str] = []
    for item in (value or "").split("/"):
        kind, separator, word = item.partition(":")
        word = word.strip()
        if separator and kind in accepted and word and word not in forms:
            forms.append(word[:80])
    return forms[:10]


def qualifies(row: dict[str, str]) -> bool:
    collins = integer(row, "collins")
    oxford = integer(row, "oxford")
    bnc = integer(row, "bnc")
    frq = integer(row, "frq")
    tags = set((row.get("tag") or "").split())
    return bool(
        oxford
        or collins
        or 0 < bnc <= 12000
        or 0 < frq <= 12000
        or tags & EXAM_TAGS
    )


def importance(row: dict[str, str]) -> int:
    collins = min(integer(row, "collins"), 5)
    oxford = bool(integer(row, "oxford"))
    bnc = integer(row, "bnc")
    frq = integer(row, "frq")
    tags = set((row.get("tag") or "").split())
    score = (2_000_000 if oxford else 0) + collins * 250_000
    score += max(0, 100_000 - bnc * 5) if bnc else 0
    score += max(0, 100_000 - frq * 5) if frq else 0
    score += len(tags & EXAM_TAGS) * 20_000
    return score


def usable_word(word: str) -> bool:
    if not word or len(word) > 80 or not re.search(r"[A-Za-z]", word):
        return False
    return not re.search(r"[\x00-\x1f\x7f]", word)


def row_to_entry(row: dict[str, str]) -> list[object] | None:
    word = re.sub(r"\s+", " ", (row.get("word") or "").strip())
    key = normalize_key(word)
    if key in KNOWN_MISSPELLINGS:
        return None
    meaning = compact_lines(row.get("translation"), maximum_lines=4, maximum_total=760)
    if not usable_word(word) or not meaning:
        return None
    definition = compact_lines(row.get("definition"), maximum_lines=3, maximum_total=900)
    phonetic = re.sub(r"\s+", " ", (row.get("phonetic") or "").strip())[:120]
    part_of_speech = primary_part_of_speech(row, definition, meaning)
    tags = " ".join((row.get("tag") or "").split())[:120]
    forms = forms_from_exchange(row.get("exchange"))
    return [
        key,
        word,
        phonetic,
        part_of_speech,
        meaning,
        definition,
        min(integer(row, "collins"), 5),
        1 if integer(row, "oxford") else 0,
        integer(row, "bnc"),
        integer(row, "frq"),
        tags,
        forms,
    ]


def build(source: Path, *, limit: int) -> dict[str, object]:
    candidates: dict[str, tuple[int, bool, list[object]]] = {}
    digest = hashlib.sha256()
    with source.open("rb") as binary:
        for chunk in iter(lambda: binary.read(1024 * 1024), b""):
            digest.update(chunk)

    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            entry = row_to_entry(row)
            if not entry:
                continue
            key = str(entry[0])
            required = key in REQUIRED_TERMS
            qualified = qualifies(row)
            common_phrase = " " in key and qualified
            if not (required or qualified):
                continue
            score = importance(row)
            previous = candidates.get(key)
            if previous is None or score > previous[0]:
                candidates[key] = (score, common_phrase, entry)

    for key, supplemental in SUPPLEMENTAL_ENTRIES.items():
        normalized = normalize_key(key)
        entry = [
            normalized,
            supplemental["word"],
            supplemental.get("phonetic", ""),
            supplemental.get("part_of_speech", ""),
            supplemental["meaning"],
            supplemental.get("definition", ""),
            0,
            0,
            0,
            0,
            "editorial",
            [],
        ]
        # Required editorial entries receive a high deterministic score.  They
        # still count toward the requested limit and displace low-ranked words.
        candidates[normalized] = (4_000_000, " " in normalized, entry)

    required_entries = [value for key, value in candidates.items() if key in REQUIRED_TERMS]
    phrase_entries = [value for key, value in candidates.items() if value[1] and key not in REQUIRED_TERMS]
    word_entries = [value for key, value in candidates.items() if not value[1] and key not in REQUIRED_TERMS]
    sort_key = lambda value: (-value[0], str(value[2][0]))
    required_entries.sort(key=lambda value: str(value[2][0]))
    phrase_entries.sort(key=sort_key)
    word_entries.sort(key=sort_key)

    selected: list[tuple[int, bool, list[object]]] = []
    selected.extend(required_entries)
    selected.extend(phrase_entries)
    remaining = max(0, limit - len(selected))
    selected.extend(word_entries[:remaining])

    by_key = {str(value[2][0]): value[2] for value in selected}
    for key, override in EDITORIAL_OVERRIDES.items():
        if key not in by_key:
            continue
        entry = by_key[key]
        entry[3] = override.get("part_of_speech", entry[3])
        entry[4] = override.get("meaning", entry[4])
        entry[5] = override.get("definition", entry[5])
        entry[10] = " ".join(dict.fromkeys([*(str(entry[10]) or "").split(), "editorial"]))

    entries = [by_key[key] for key in sorted(by_key)]
    missing = sorted(REQUIRED_TERMS - set(by_key))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "name": "ECDICT",
            "url": "https://github.com/skywind3000/ECDICT",
            "license": "MIT",
            "sha256": digest.hexdigest(),
        },
        "columns": [
            "key", "word", "phonetic", "partOfSpeech", "meaning", "definition",
            "collins", "oxford", "bnc", "frq", "tags", "forms",
        ],
        "count": len(entries),
        "requiredMissing": missing,
        "entries": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error(f"source CSV does not exist: {args.source}")
    if not 5000 <= args.limit <= 8000:
        parser.error("--limit must be between 5000 and 8000")

    payload = build(args.source, limit=args.limit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {payload['count']} entries to {args.output} "
        f"({args.output.stat().st_size} bytes); "
        f"required missing: {len(payload['requiredMissing'])}"
    )
    if payload["requiredMissing"]:
        print("missing:", ", ".join(payload["requiredMissing"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
