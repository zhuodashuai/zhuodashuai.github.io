#!/usr/bin/env python3
"""Make an explicitly unreviewed headword queue, NOT a translated dictionary.

Only ECDICT headwords and lexical ranking/lemma metadata are consumed. Definitions,
translations, pronunciation and examples are deliberately never copied. Run on a
locally downloaded, commit-pinned upstream CSV; outputs must stay outside the repo.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

WORD = re.compile(r"^[A-Za-z]+(?:['-][A-Za-z]+)*$")
KNOWN_ERRORS = {"accomodate", "definately", "enviroment", "neccessary", "recieve", "seperate", "wierd"}


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).replace("’", "'").replace("‘", "'").split())


def nonnegative(value: str) -> int:
    try:
        return max(0, int(value or 0))
    except ValueError:
        return 0


def candidates_from_rows(rows):
    candidates = {}
    stats = {"sourceRows": 0, "shapeRejected": 0, "knownErrorsRejected": 0,
             "explicitInflectionRowsExcluded": 0, "caseDuplicatesMerged": 0}
    for row in rows:
        stats["sourceRows"] += 1
        headword = normalized(row.get("word", ""))
        if not WORD.fullmatch(headword) or len(headword) > 100:
            stats["shapeRejected"] += 1
            continue
        key = headword.casefold()
        if key in KNOWN_ERRORS:
            stats["knownErrorsRejected"] += 1
            continue
        # ECDICT's explicit 0: field identifies the lemma of an inflected row.
        # Do not inflate this queue by counting those rows as new headwords.
        lemmas = {normalized(part[2:]).casefold() for part in row.get("exchange", "").split("/")
                  if part.startswith("0:") and part[2:]}
        if lemmas and key not in lemmas:
            stats["explicitInflectionRowsExcluded"] += 1
            continue
        bnc, frq = nonnegative(row.get("bnc", "")), nonnegative(row.get("frq", ""))
        frequencies = [value for value in (bnc, frq) if value]
        tags = set(row.get("tag", "").split())
        rank = (-bool(tags & {"zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts", "gre"}),
                -nonnegative(row.get("collins", "")), min(frequencies, default=10**12), key)
        if key in candidates:
            stats["caseDuplicatesMerged"] += 1
            current = candidates[key]
            current["observedSpellings"].add(headword)
            if rank < current["rank"]:
                current["rank"] = rank
            continue
        candidates[key] = {"headword": headword, "observedSpellings": {headword}, "rank": rank}
    return sorted(candidates.values(), key=lambda item: item["rank"]), stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--limit", type=int, default=70000)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("--commit must be a pinned 40-character upstream Git commit")
    if not 1 <= args.limit <= 500000:
        parser.error("--limit must be between 1 and 500000")
    repo = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    if output.is_relative_to(repo):
        parser.error("candidate queue is unreviewed; keep output outside the public repository")
    if output.exists():
        parser.error("output already exists; choose a new path, no overwrite is performed")
    with args.csv.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not {"word", "exchange", "bnc", "frq", "collins", "tag"}.issubset(reader.fieldnames or []):
            parser.error("input is not the expected ECDICT CSV")
        candidates, stats = candidates_from_rows(reader)
    selected = candidates[:args.limit]
    with args.csv.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    payload = {
        "schemaVersion": 1,
        "purpose": "headword-candidate-queue-only",
        "status": "unreviewed",
        "targetHeadwordCount": args.limit,
        "selectedCandidateCount": len(selected),
        "eligibleCandidateCount": len(candidates),
        "reviewedHeadwordCount": 0,
        "originalDefinitionCount": 0,
        "sixPdfCoverageComplete": False,
        "coverageNote": "This is an open-data headword seed, not an extraction of the six supplied PDFs. Shapes and explicit lemma links are filtered, but lexical validity and remaining inflections need review.",
        "source": {"name": "ECDICT headwords and lexical ranking metadata only", "license": "MIT",
                   "url": f"https://github.com/skywind3000/ECDICT/blob/{args.commit}/ecdict.csv",
                   "commit": args.commit, "sha256": digest},
        "statistics": stats,
        "headwords": [{"headword": item["headword"], "observedSpellings": sorted(item["observedSpellings"]),
                       "status": "candidate", "definitionStatus": "not-authored"} for item in selected],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({"output": str(output), "selectedCandidates": len(selected), "eligibleCandidates": len(candidates),
                      "reviewedHeadwords": 0, "originalDefinitions": 0, "sixPdfCoverageComplete": False, **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
