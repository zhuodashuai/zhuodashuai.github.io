import csv
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "prepare-expanded-dictionary.py"
SPEC = importlib.util.spec_from_file_location("prepare_expanded_dictionary", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def make_workbook(path, main, pending, *, shared=False):
    """Small XML fixtures; commercial B/F sentinels must never reach outputs."""
    shared_values = ["PUBLISHER_PRIVATE_BF_SENTINEL", "词条 / 词组", "候选词形", *main, *pending]
    with ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="词条与词组" sheetId="1" r:id="r1"/><sheet name="待核词形" sheetId="2" r:id="r2"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="/xl/worksheets/sheet2.xml"/></Relationships>')
        if shared:
            archive.writestr("xl/sharedStrings.xml", f'<sst xmlns="{NS}">' + "".join(f'<si><t>{escape(value)}</t></si>' for value in shared_values) + '</sst>')
        for number, (header, heads) in enumerate((("词条 / 词组", main), ("候选词形", pending)), 1):
            rows = []
            for row, value in enumerate([header, *heads], 6):
                if shared:
                    cell = f'<c r="A{row}" t="s"><v>{shared_values.index(value)}</v></c>'
                    private = f'<c r="B{row}" t="s"><v>0</v></c><c r="F{row}" t="s"><v>0</v></c>'
                else:
                    cell = f'<c r="A{row}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
                    private = f'<c r="B{row}" t="str"><v>PUBLISHER_PRIVATE_BF_SENTINEL</v></c><c r="F{row}" t="str"><v>PUBLISHER_PRIVATE_BF_SENTINEL</v></c>'
                rows.append(f'<row r="{row}">{cell}{private}</row>')
            archive.writestr(f"xl/worksheets/sheet{number}.xml", f'<worksheet xmlns="{NS}"><sheetData>{"".join(rows)}</sheetData></worksheet>')


class PrepareExpandedDictionaryTests(unittest.TestCase):
    def test_streaming_reads_only_column_a_including_shared_and_inline_strings(self):
        with tempfile.TemporaryDirectory() as directory:
            for shared in (False, True):
                path = Path(directory) / f"{shared}.xlsx"
                make_workbook(path, ["Apple", "apple", "a  phrase"], ["pending"], shared=shared)
                result = MODULE.read_workbook_heads(path)
                self.assertEqual([row["headword"] for row in result["词条与词组"]["heads"]], ["Apple", "apple", "a phrase"])
                self.assertEqual(len(result["待核词形"]["heads"]), 1)
                self.assertNotIn("PUBLISHER_PRIVATE_BF_SENTINEL", json.dumps(result))

    def test_multi_pos_and_forms_are_complete_not_first_label_or_truncated(self):
        self.assertEqual(MODULE.parts_of_speech("n. 名词\nvt. 动词\na. 形容词"), "noun · verb · adjective")
        forms, omitted = MODULE.forms_from_exchange("p:went/d:gone/i:going/3:goes/0:lemma/s:goes/p:" + "a" * 201)
        self.assertEqual(forms, ["went", "gone", "going", "goes"])
        self.assertEqual(omitted, ["a" * 201])
        text = "n. " + "完整中文" * 200
        self.assertEqual(MODULE.decode_ecdict(text), text)
        self.assertEqual(MODULE.parts_of_speech("中文无标注"), "")

    def test_pinned_mit_join_excludes_nonmatches_errors_and_overlong_meanings(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            workbook, source, candidates, core = [folder / name for name in ("input.xlsx", "ecdict.csv", "candidates.json", "core.json")]
            make_workbook(workbook, ["apple", "apple", "Apple", "private-only", "long", "accomodate"], ["pending", "ghost"], shared=True)
            fields = ["word", "translation", "pos", "exchange"]
            source_rows = [
                {"word": "apple", "translation": "n. 苹果\\na. 苹果的", "pos": "n", "exchange": "s:apples"},
                {"word": "Apple", "translation": "n. 苹果公司", "pos": "n", "exchange": ""},
                {"word": "pending", "translation": "a. 待定的", "pos": "a", "exchange": ""},
                {"word": "queue", "translation": "n. 队列", "pos": "n", "exchange": "s:queues"},
                {"word": "long", "translation": "中" * 2001, "pos": "", "exchange": ""},
                {"word": "accomodate", "translation": "错拼释义不应收录", "pos": "v", "exchange": ""},
                {"word": "english-only", "translation": "no Chinese", "pos": "", "exchange": ""},
            ]
            with source.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=fields); writer.writeheader(); writer.writerows(source_rows)
            candidates.write_text(json.dumps({"purpose": "headword-candidate-queue-only", "selectedCandidateCount": 2,
                "source": {"sha256": MODULE.PINNED_SHA256}, "headwords": [{"headword": term, "observedSpellings": [term], "status": "candidate", "definitionStatus": "not-authored"} for term in ["queue", "english-only"]]}), encoding="utf-8")
            core.write_text(json.dumps({"source": {"name": "ECDICT", "license": "MIT"}, "columns": ["word", "meaning", "partOfSpeech", "forms"],
                "entries": [["24/7", "全天候", "adverb", []], ["apple", "旧苹果义", "noun", []]]}), encoding="utf-8")
            source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                MODULE.prepare_inputs(workbook, source, candidates, core)
            payload, audit = MODULE.prepare_inputs(workbook, source, candidates, core, expected_sha=source_sha)
            rows = {row["term"]: row for row in payload["rows"]}
            self.assertEqual(set(rows), {"apple", "Apple", "pending", "queue", "24/7"})
            self.assertEqual(rows["apple"]["meaning"], "n. 苹果\na. 苹果的")
            self.assertEqual(rows["apple"]["partOfSpeech"], "noun · adjective")
            self.assertEqual(rows["24/7"]["source"], "core")
            self.assertFalse(rows["24/7"]["workbook"])
            self.assertEqual(audit["counts"]["meaningsOver2000Excluded"], 1)
            self.assertEqual(audit["counts"]["caseVariantGroups"], 1)
            self.assertEqual(audit["workbook"]["sheets"]["词条与词组"]["dataRows"], 6)
            self.assertEqual(audit["workbook"]["sheets"]["词条与词组"]["uniqueHeads"], 5)
            self.assertEqual(audit["workbook"]["sheets"]["待核词形"]["matched"], ["pending"])
            self.assertEqual(audit["workbook"]["sheets"]["待核词形"]["unmatched"], ["ghost"])
            self.assertEqual(audit["candidateQueue"]["includedHeads"], 1)
            self.assertNotIn("PUBLISHER_PRIVATE_BF_SENTINEL", json.dumps(payload) + json.dumps(audit))
            self.assertNotIn("private-only", rows)


if __name__ == "__main__":
    unittest.main()
