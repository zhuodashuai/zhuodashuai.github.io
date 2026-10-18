#!/usr/bin/env python3
"""Private metadata/coverage ledger; does not extract or publish dictionary text."""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader
from pypdf.constants import UserAccessPermissions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(Path(__file__).resolve().parents[2]):
        parser.error("private source ledger must remain outside the public repository")
    if output.exists():
        parser.error("output exists; no overwrite is performed")
    files = sorted(path for path in args.directory.iterdir() if path.suffix.lower() == ".pdf")
    result = {"schemaVersion": 1, "scope": "private-source-inspection-only", "allSourcesIndexed": False,
              "allHeadwordsCovered": False, "sources": []}
    for path in files:
        try:
            reader = PdfReader(path)
            count = len(reader.pages)
            permissions = reader.user_access_permissions
        except Exception as error:
            result["sources"].append({"filename": path.name, "bytes": path.stat().st_size,
                                      "state": "unreadable-not-extracted", "errorType": type(error).__name__,
                                      "headwordPagesIndexed": 0, "headwordCoverageVerified": False})
            continue
        copy_allowed = not reader.is_encrypted or (permissions is not None and bool(permissions & UserAccessPermissions.EXTRACT))
        samples = []
        if copy_allowed:
            for index in sorted({min(30, count - 1), count // 4, count // 2, 3 * count // 4}):
                try:
                    text = reader.pages[index].extract_text() or ""
                    samples.append({"pdfPage": index + 1, "textCharacters": len(text.strip()),
                                    "hanCharacters": sum("\u4e00" <= char <= "\u9fff" for char in text)})
                except Exception as error:
                    samples.append({"pdfPage": index + 1, "state": "unreadable-not-extracted", "errorType": type(error).__name__})
        with path.open("rb") as stream:
            sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
        result["sources"].append({
            "filename": path.name, "bytes": path.stat().st_size, "sha256": sha256,
            "pdfPages": count, "copyAllowedByPdfFlag": copy_allowed,
            "headwordPagesIndexed": 0, "headwordCoverageVerified": False,
            "state": ("permission-unknown-not-extracted" if permissions is None else "permission-restricted-not-extracted") if not copy_allowed else (
                "requires-ocr-and-headword-review" if all(not row.get("textCharacters") for row in samples)
                else "text-layer-present-requires-layout-and-accuracy-review"),
            "samples": samples,
            "note": "Permission flags do not establish a public licence. Text-layer sampling does not verify lexical completeness or OCR accuracy. No definitions or examples are stored in this ledger."
        })
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({"output": str(output), "sources": len(result["sources"]),
                      "pages": sum(row.get("pdfPages", 0) for row in result["sources"]),
                      "headwordPagesIndexed": 0, "allHeadwordsCovered": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
