import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("headword_seed", Path(__file__).resolve().parents[1] / "scripts/seed-original-headwords.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class HeadwordSeedTests(unittest.TestCase):
    def test_case_variants_are_one_candidate_but_spellings_retained(self):
        rows, stats = seed.candidates_from_rows([{"word": "Bank"}, {"word": "bank"}])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["observedSpellings"], {"bank", "Bank"})
        self.assertEqual(stats["caseDuplicatesMerged"], 1)

    def test_explicit_inflections_are_not_counted_to_inflate_target(self):
        rows, stats = seed.candidates_from_rows([{"word": "receive", "exchange": "p:received/d:received"}, {"word": "received", "exchange": "0:receive"}])
        self.assertEqual([row["headword"] for row in rows], ["receive"])
        self.assertEqual(stats["explicitInflectionRowsExcluded"], 1)

    def test_only_headwords_not_definitions_are_consumed(self):
        rows, _ = seed.candidates_from_rows([{"word": "fluke", "definition": "do not copy", "translation": "不复制", "example": "do not copy either"}])
        self.assertEqual(set(rows[0]), {"headword", "observedSpellings", "rank"})
        self.assertNotIn("do not copy", repr(rows))

    def test_nonword_shapes_and_known_misspelling_rejected(self):
        rows, stats = seed.candidates_from_rows([{"word": word} for word in ["by some fluke", "中文", "word123", "-prefix", "accomodate", "can't", "well-being"]])
        self.assertEqual({row["headword"] for row in rows}, {"can't", "well-being"})
        self.assertEqual(stats["knownErrorsRejected"], 1)

    def test_alphabetic_ocr_garbage_is_not_claimed_verified(self):
        rows, _ = seed.candidates_from_rows([{"word": "rnodern"}])
        # Lexical validation is intentionally not invented from a shape check.
        self.assertEqual(rows[0]["headword"], "rnodern")


if __name__ == "__main__":
    unittest.main()
