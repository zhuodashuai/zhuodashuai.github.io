#!/usr/bin/env python3
"""Prepare licensed lookup input; commercial workbooks supply column-A heads only.

The workbook is never a source of meanings, definitions, examples or POS. Its
other cells are discarded during streaming XML parsing, and shared strings are
decoded only for the indices referenced by column A. Outputs must remain private.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import posixpath
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

PINNED_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
PINNED_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
KNOWN_ERRORS = {"accomodate", "definately", "enviroment", "neccessary", "recieve", "seperate", "wierd"}
SHEETS = ("词条与词组", "待核词形")
MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
HAN = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
POS_NAMES = {
    "n": "noun", "noun": "noun", "v": "verb", "vt": "verb", "vi": "verb", "verb": "verb",
    "a": "adjective", "adj": "adjective", "adjective": "adjective", "ad": "adverb", "adv": "adverb", "adverb": "adverb",
    "pron": "pronoun", "prep": "preposition", "conj": "conjunction", "int": "interjection", "interj": "interjection",
    "num": "numeral", "art": "article", "det": "determiner", "aux": "auxiliary verb", "modal": "modal verb", "abbr": "abbreviation",
}
POS_PREFIX = re.compile(r"(?<![A-Za-z])(" + "|".join(sorted(POS_NAMES, key=len, reverse=True)) + r")\.", re.I)


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def normalize_term(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).replace("’", "'").replace("‘", "'").split())


def valid_term(term: str) -> bool:
    return bool(term and len(term) <= 200 and not CONTROL.search(term) and not HAN.search(term)
                and (re.search(r"[A-Za-z]", term) or term == "24/7")
                and not re.search(r"</?[A-Za-z][^>]*>|javascript\s*:", term, re.I))


def decode_ecdict(value: str) -> str:
    # Decode only the CSV's documented line/backslash escapes, not arbitrary
    # unicode escapes and never a destructive per-line or total-length truncation.
    return re.sub(r"\\([nr\\])", lambda match: {"n": "\n", "r": "\r", "\\": "\\"}[match[1]], value or "").replace("\r\n", "\n").strip()


def parts_of_speech(meaning: str, raw_pos: str = "") -> str:
    labels = [POS_NAMES[match[1].lower()] for match in POS_PREFIX.finditer(meaning)]
    if not labels:
        labels = [POS_NAMES[token] for token in re.findall(r"[A-Za-z]+", raw_pos.lower()) if token in POS_NAMES]
    return " · ".join(dict.fromkeys(labels))


def forms_from_exchange(value: str) -> tuple[list[str], list[str]]:
    forms, omitted = [], []
    for part in (value or "").split("/"):
        kind, separator, raw = part.partition(":")
        if not separator or kind not in {"s", "p", "d", "i", "3", "r", "t"}:
            continue
        form = normalize_term(raw)
        if form in forms or form in omitted:
            continue
        if valid_term(form) and form.casefold() not in KNOWN_ERRORS and len(forms) < 32:
            forms.append(form)
        else:
            omitted.append(form)
    return forms, omitted


def _worksheet_paths(archive: ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {item.attrib["Id"]: item.attrib["Target"] for item in rels
               if item.attrib.get("TargetMode") != "External"}
    result = {}
    for sheet in workbook.find(MAIN_NS + "sheets"):
        name = sheet.attrib["name"]
        target = targets[sheet.attrib[REL_NS + "id"]]
        target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        if not target.startswith("xl/") or ".." in target.split("/"):
            raise ValueError("Unsafe workbook worksheet relationship")
        result[name] = target
    return result


def read_workbook_heads(path: Path, *, header_row: int = 6) -> dict:
    """Read A only; never return or retain any B/F value or shared string."""
    with ZipFile(path) as archive:
        paths = _worksheet_paths(archive)
        pending, requested_strings = {}, set()
        for name in SHEETS:
            if name not in paths:
                raise ValueError(f"Required workbook sheet missing: {name}")
            cells, formula_rows = [], []
            with archive.open(paths[name]) as stream:
                for _, element in ET.iterparse(stream, events=("end",)):
                    if element.tag == MAIN_NS + "c":
                        reference = element.attrib.get("r", "")
                        if re.fullmatch(r"A[1-9]\d*", reference):
                            row = int(reference[1:])
                            if row >= header_row:
                                if element.find(MAIN_NS + "f") is not None:
                                    formula_rows.append(row)
                                else:
                                    value_node = element.find(MAIN_NS + "v")
                                    raw = value_node.text if value_node is not None and value_node.text else ""
                                    kind = element.attrib.get("t", "")
                                    if kind == "inlineStr":
                                        raw = "".join(item.text or "" for item in element.iter(MAIN_NS + "t"))
                                    if kind == "s":
                                        requested_strings.add(int(raw))
                                    cells.append((row, kind, raw))
                        element.clear()
                    elif element.tag == MAIN_NS + "row":
                        element.clear()
            pending[name] = {"cells": cells, "formulaRowsOmitted": formula_rows}
        shared = {}
        if requested_strings:
            if "xl/sharedStrings.xml" not in archive.namelist():
                raise ValueError("Workbook references missing shared strings")
            index = 0
            with archive.open("xl/sharedStrings.xml") as stream:
                for _, element in ET.iterparse(stream, events=("end",)):
                    if element.tag == MAIN_NS + "si":
                        if index in requested_strings:
                            shared[index] = "".join(item.text or "" for item in element.iter(MAIN_NS + "t"))
                        index += 1
                        element.clear()
        result = {}
        for name, item in pending.items():
            header, heads, ignored = "", [], []
            for row, kind, raw in item["cells"]:
                value = shared[int(raw)] if kind == "s" else raw
                if row == header_row:
                    header = value
                    continue
                if not value.strip():
                    continue
                if kind not in {"s", "str", "inlineStr"}:
                    ignored.append({"row": row, "reason": "non-text-column-A"})
                    continue
                heads.append({"row": row, "headword": normalize_term(value)})
            if not header or not any(word in header for word in ("词条", "词形", "词组")):
                raise ValueError(f"Unexpected column-A header at {name}!A{header_row}")
            result[name] = {"header": header, "heads": heads, "formulaRowsOmitted": item["formulaRowsOmitted"], "nonTextRowsOmitted": ignored}
        return result


def _read_candidates(path: Path) -> tuple[dict, list[str]]:
    queue = json.loads(path.read_text(encoding="utf-8"))
    if queue.get("purpose") != "headword-candidate-queue-only" or queue.get("source", {}).get("sha256") != PINNED_SHA256:
        raise ValueError("Headword queue does not identify the pinned MIT source")
    if queue.get("selectedCandidateCount") != len(queue.get("headwords", [])):
        raise ValueError("Candidate queue count does not match actual rows")
    heads = []
    for row in queue["headwords"]:
        if row.get("status") != "candidate" or row.get("definitionStatus") != "not-authored" or not isinstance(row.get("headword"), str):
            raise ValueError("Expected headword-only candidate rows")
        heads.extend([row["headword"], *row.get("observedSpellings", [])])
    return queue, list(dict.fromkeys(normalize_term(head) for head in heads))


def prepare_inputs(workbook: Path, source: Path, candidates: Path, core: Path, *, expected_sha: str = PINNED_SHA256) -> tuple[dict, dict]:
    source_sha = sha256(source)
    if source_sha != expected_sha:
        raise ValueError("ECDICT CSV SHA-256 does not match the pinned source")
    sheets = read_workbook_heads(workbook)
    queue, queue_heads = _read_candidates(candidates)
    baseline = json.loads(core.read_text(encoding="utf-8"))
    if baseline.get("source", {}).get("license") != "MIT" or baseline.get("source", {}).get("name") != "ECDICT":
        raise ValueError("Expected existing published MIT ECDICT baseline")
    columns = baseline["columns"]
    baseline_rows = [dict(zip(columns, row)) for row in baseline["entries"]]
    baseline_by_term = {normalize_term(row["word"]): row for row in baseline_rows}
    workbook_terms = {item["headword"] for sheet in sheets.values() for item in sheet["heads"]}
    ranks = {head: rank for rank, head in reversed(list(enumerate(queue_heads)))}
    # Preserve the fixed queue's existing priority; workbook-only matches follow
    # in source order, then baseline-only supplemental entries.
    for term in sorted(workbook_terms):
        ranks.setdefault(term, len(ranks))
    for term in baseline_by_term:
        ranks.setdefault(term, len(ranks))
    wanted = set(ranks)
    exact_seen, rows, excluded, duplicates, omitted_forms = set(), {}, [], [], []
    explicit_lemma_links = {}
    source_rows = 0
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not {"word", "translation", "pos", "exchange"}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected ECDICT CSV fields")
        for source_row in reader:
            source_rows += 1
            term = normalize_term(source_row.get("word", ""))
            if term not in wanted:
                continue
            exact_seen.add(term)
            reason = ""
            meaning = decode_ecdict(source_row.get("translation", ""))
            pos = parts_of_speech(meaning, source_row.get("pos", ""))
            if term.casefold() in KNOWN_ERRORS:
                reason = "known-misspelling"
            elif not valid_term(term):
                reason = "invalid-or-overlong-term"
            elif not HAN.search(meaning):
                reason = "no-Chinese-translation"
            elif len(meaning) > 2000:
                reason = "meaning-over-2000"
            elif CONTROL.search(meaning):
                reason = "control-character-in-meaning"
            elif len(pos) > 200:
                reason = "part-of-speech-over-200"
            if reason:
                excluded.append({"term": term, "reason": reason, "meaningCharacters": len(meaning)})
                continue
            forms, rejected_forms = forms_from_exchange(source_row.get("exchange", ""))
            lemmas = [normalize_term(part[2:]) for part in source_row.get("exchange", "").split("/")
                      if part.startswith("0:") and normalize_term(part[2:])
                      and normalize_term(part[2:]).casefold() != term.casefold()]
            if lemmas:
                explicit_lemma_links[term] = list(dict.fromkeys(lemmas))
            if rejected_forms:
                omitted_forms.append({"term": term, "forms": rejected_forms})
            row = {"term": term, "partOfSpeech": pos, "meaning": meaning, "forms": forms,
                   "rank": ranks[term], "workbook": term in workbook_terms}
            if term in rows:
                if rows[term] != row:
                    duplicates.append(term)
                    rows.pop(term, None)
                    excluded.append({"term": term, "reason": "conflicting-exact-source-rows"})
                continue
            rows[term] = row
    if duplicates:
        # A duplicate is not a licence to select one arbitrary definition.
        for term in duplicates:
            rows.pop(term, None)
    supplemental_baseline = []
    baseline_without_meaning = []
    for term, original in baseline_by_term.items():
        if term in rows or term in exact_seen:
            continue
        meaning = original.get("meaning", "").strip()
        if not valid_term(term) or not HAN.search(meaning) or len(meaning) > 2000 or CONTROL.search(meaning):
            baseline_without_meaning.append(term)
            continue
        supplemental_baseline.append(term)
        forms = [normalize_term(form) for form in original.get("forms", []) if valid_term(normalize_term(form))][:32]
        rows[term] = {"term": term, "partOfSpeech": parts_of_speech(meaning, original.get("partOfSpeech", "")),
                      "meaning": meaning, "forms": list(dict.fromkeys(forms)), "rank": ranks[term], "workbook": False, "source": "core"}
    published_terms = set(rows)
    sheet_audit = {}
    for name, sheet in sheets.items():
        heads = sheet["heads"]
        unique = sorted({item["headword"] for item in heads})
        matches = [head for head in unique if head in exact_seen]
        included = [head for head in unique if head in published_terms and head in exact_seen]
        sheet_audit[name] = {"column": "A", "headerRow": 6, "dataRows": len(heads), "uniqueHeads": len(unique),
                             "actualDataRowRange": [heads[0]["row"], heads[-1]["row"]] if heads else [],
                             "lastTenHeads": heads[-10:], "validEnglishCandidateRows": sum(valid_term(item["headword"]) for item in heads),
                             "invalidEnglishCandidateRows": [item for item in heads if not valid_term(item["headword"])],
                             "repeatedHeaderRows": [item for item in heads if item["headword"] == normalize_term(sheet["header"])],
                             "duplicateHeadRows": len(heads) - len(unique), "exactMitMatchedHeads": len(matches),
                             "includedWithChineseHeads": len(included), "matched": matches,
                             "unmatched": [head for head in unique if head not in exact_seen],
                             "matchedButExcluded": [head for head in matches if head not in published_terms],
                             "formulaRowsOmitted": sheet["formulaRowsOmitted"], "nonTextRowsOmitted": sheet["nonTextRowsOmitted"]}
    folded = defaultdict(list)
    for term in published_terms:
        folded[term.casefold()].append(term)
    variants = [{"key": key, "terms": sorted(values)} for key, values in sorted(folded.items()) if len(values) > 1]
    source_metadata = {"name": "ECDICT", "license": "MIT", "url": "https://github.com/skywind3000/ECDICT",
                       "commit": PINNED_COMMIT, "sha256": source_sha,
                       "baseline": {"name": "existing published core including editorial additions", "sha256": sha256(core),
                                    "supplementalTerms": sorted(supplemental_baseline)}}
    output_rows = sorted(rows.values(), key=lambda row: (row["rank"], row["term"]))
    workbook_heads_sha = hashlib.sha256(json.dumps([{ "sheet": name, "heads": [item["headword"] for item in sheets[name]["heads"]] } for name in SHEETS],
                                                   ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    candidate_sha = sha256(candidates)
    payload = {"schemaVersion": 1, "source": source_metadata, "headlistSha256": candidate_sha,
               "workbookHeadsSha256": workbook_heads_sha, "rows": output_rows}
    audit = {"schemaVersion": 1, "source": source_metadata,
             "workbook": {"sha256": sha256(workbook), "readColumns": ["A"], "publisherMeaningColumnsUsed": False,
                          "sheets": sheet_audit, "wholeSixDictionaryCoverageVerified": False},
             "headlistSha256": candidate_sha, "workbookHeadsSha256": workbook_heads_sha,
             "digestAlgorithms": {"headlistSha256": "SHA-256 of complete fixed 70k candidate JSON file bytes",
                                  "workbookHeadsSha256": "SHA-256 of UTF-8 compact JSON [{sheet,heads}] in SHEETS order; normalized column-A data strings in row order; duplicates retained"},
             "candidateQueue": {"sha256": candidate_sha, "selectedHeads": queue["selectedCandidateCount"],
                                "includedHeads": sum(normalize_term(item["headword"]) in published_terms for item in queue["headwords"]),
                                "unmatched": [head for head in queue_heads if head not in exact_seen],
                                "matchedButExcluded": [head for head in queue_heads if head in exact_seen and head not in published_terms]},
             "counts": {"sourceCsvRows": source_rows, "requestedExactHeads": len(wanted), "rows": len(output_rows),
                        "uniqueCaseSensitiveTerms": len(published_terms), "uniqueCasefoldKeys": len(folded),
                        "workbookTermsIncluded": sum(row["workbook"] for row in output_rows),
                        "caseVariantGroups": len(variants), "sourceRowsExcluded": len(excluded),
                        "recordsWithExplicitLemmaLink": sum(term in explicit_lemma_links for term in published_terms),
                        "meaningsOver2000Excluded": sum(item["reason"] == "meaning-over-2000" for item in excluded),
                        "unknownPOS": sum(not row["partOfSpeech"] for row in output_rows),
                        "baselineInput": len(baseline_rows), "baselineMissingFromPrepared": sum(term not in published_terms for term in baseline_by_term)},
             "excluded": excluded, "caseVariants": variants, "omittedForms": omitted_forms,
             "recordsWithExplicitLemmaLink": [{"term": term, "lemmas": lemmas} for term, lemmas in sorted(explicit_lemma_links.items()) if term in published_terms],
             "baselineMissingFromPrepared": sorted(term for term in baseline_by_term if term not in published_terms),
             "baselineSupplementalTerms": sorted(supplemental_baseline), "baselineSupplementalWithoutChinese": baseline_without_meaning,
             "note": "MIT Chinese translations are retained without shortening. Workbook A provides candidate names only; B/F and publisher wording are not used. Some exact MIT records have explicit lemma links, including lexicalized forms; records are not all independently reviewed lemmas. Ready original entries are a separate input; this is not an original 70k dictionary or a six-PDF-completeness audit."}
    return payload, audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--core", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--replace-existing", action="store_true", help="Replace only this tool's prior prepared-input.json/audit.json in the named private output directory")
    args = parser.parse_args()
    destination = args.out.resolve()
    repo = Path(__file__).resolve().parents[2]
    if destination.is_relative_to(repo):
        parser.error("Prepared input and audit must remain outside the public repository")
    existing = [(destination / name) for name in ("prepared-input.json", "audit.json") if (destination / name).exists()]
    if existing and not args.replace_existing:
        parser.error("Output already exists; choose a new private directory or explicitly --replace-existing")
    for path in existing:
        old = json.loads(path.read_text(encoding="utf-8"))
        if old.get("schemaVersion") != 1 or old.get("source", {}).get("sha256") != PINNED_SHA256:
            parser.error("Existing output is not this tool's pinned-source preparation; refusing replacement")
    payload, audit = prepare_inputs(args.workbook, args.source, args.candidates, args.core)
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / "prepared-input.json").open("w" if args.replace_existing else "x", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, separators=(",", ":")); stream.write("\n")
    with (destination / "audit.json").open("w" if args.replace_existing else "x", encoding="utf-8") as stream:
        json.dump(audit, stream, ensure_ascii=False, indent=2); stream.write("\n")
    print(json.dumps({"output": str(destination), **audit["counts"], "workbook": {name: {key: value for key, value in sheet.items() if key not in {"matched", "unmatched", "matchedButExcluded", "formulaRowsOmitted", "nonTextRowsOmitted"}} for name, sheet in audit["workbook"]["sheets"].items()}}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
