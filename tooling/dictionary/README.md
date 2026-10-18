# 卓式词典: local editorial foundation, not a released dictionary

Target: at least **70,000 reviewed, distinct lexical headwords with independently
written meanings**, not 70,000 inflected forms or empty search results. The new
tools do not change the live wordbook, members' accounts, canonical cards,
chapter quizzes or review records. No external AI/translation requests are made.

## Three separate progress counters

1. **Headword candidates**: names to consider, not established meanings.
2. **Independently written drafts**: selected senses and original examples.
3. **Checked records eligible for export**: `review.status === "checked"` AND a
   nonempty named reviewer. Merely changing a status is not a real language or
   rights review. No completeness, accuracy or legal clearance is inferred.

`source/original-pilot.json` has 30 AI-assisted original drafts, 41 selected
senses and 41 bilingual examples. The author composed them without consulting
the supplied PDFs, existing definitions or publisher examples. A separate AI
review found no known substantive language errors; this is **not** human
approval or proof of originality. Every record remains a draft. Missing senses,
IPA and irregular forms must not be invented to make a record look complete.

## Local-only build

Node.js 22.13+ is required for the built-in SQLite module (validated locally
with Node 24.19). Python 3.11+ is used for the optional CSV seed tool; `pypdf`
is only needed for optional private PDF-source inspection.

Choose explicit paths **outside the public Git/Pages repository**. Build outputs
are exclusive: a new directory is required and an old bundle is not overwritten.

```powershell
python tooling/scripts/seed-original-headwords.py --csv="C:/private/ecdict.csv" --commit=bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b --limit=70000 --output="C:/private/headword-candidates.json"
node tooling/scripts/build-original-dictionary.mjs --candidates="C:/private/headword-candidates.json" --out="C:/private/new-dictionary-bundle"
node tooling/scripts/search-original-dictionary.mjs --db="C:/private/new-dictionary-bundle/zhuo-dictionary-draft.sqlite" --query="hips" --draft
```

The seed CSV is ECDICT's **commit-pinned MIT-licensed dataset**, not the six
commercial PDFs. Only headwords, explicit lemma links and ranking metadata are
read; no source definitions, translations, phonetics or examples are copied into
the queue or pilot. The upstream licence is retained in
[`../../vocab/data/ECDICT-LICENSE.txt`](../../vocab/data/ECDICT-LICENSE.txt).
Source code, commit and SHA-256 are recorded in the generated manifest.

The seed removes duplicate case-folded candidates, explicit `0:lemma` inflection
rows, known spelling mistakes and nonword shapes, then selects by exam/frequency
metadata. That does **not** prove every remaining candidate is an English lemma,
nor does it eliminate every implicit inflection. `observedSpellings` preserves
case variants for later editorial separation; merging a candidate key is not a
claim that `US` and `us` have the same meaning. Lexical review remains necessary.

Outputs:

- `headword-candidates.csv`: UTF-8 BOM, Excel-readable, unreviewed headword queue.
- `original-entries.csv`: one row per bilingual example/sense, including review
  and authorship columns. Text is quoted and formula-leading cells escaped.
- `forms.csv`: aliases kept separately; not counted as new headwords.
- `dictionary-draft.json`: strictly validated original writing, with draft labels.
- `zhuo-dictionary-draft.sqlite`: indexed local candidates, entries, senses,
  examples and aliases. Default lookup excludes draft meanings. `--draft` is a
  deliberate editorial-only preview, not a production integration.
- `public-ready.json`: only checked/named-reviewer records; the pilot exports
  **zero** records here. No upload or deployment happens automatically.
- `build-report.json`: counts and incomplete-coverage flags, not a quality badge.

CSV is currently an editing/export view. There is **no CSV re-importer**; edit
the source JSON and rebuild rather than assuming workbook edits have changed the
database. Neither tool modifies the existing ECDICT snapshot or user records.

Exact case-sensitive headwords win; otherwise all matching folded headwords and
forms are returned. Collisions stay ambiguous. There is no fuzzy correction,
substring meaning selection or silent conflation. A registered but unauthored
candidate returns `candidate-only`, never a fabricated definition.

## Supplied PDFs are a separate, unfinished coverage audit

```powershell
python tooling/scripts/inspect-dictionary-pdf-sources.py --directory="C:/private/dictionaries" --output="C:/private/new-source-ledger.json"
```

This private ledger records hashes, page counts, PDF extraction flags and bounded
text-layer metrics only. It does not store dictionary text or claim headword
coverage. Unknown/restricted permissions are not used for text extraction.
Scanned pages still need local OCR, layout-aware headword extraction and manual
spot checks; corrupted text layers need separate correction. No entire-file OCR
or six-book headword reconciliation is implemented in this foundation.

Independent composition is different from translating/paraphrasing a
publisher's definitions. Isolated words/facts and creative compilations/database
rights are also distinct; an MIT seed licence is not a guarantee about any
commercial PDF. Do not claim that rebranding or format conversion grants rights,
or that AI-generated text has been legally cleared. The supplied commercial
PDFs and extracted publisher wording must remain outside public assets/history.

## Verification

```powershell
node --test tooling/tests/original-dictionary.test.mjs tooling/tests/original-dictionary-exports.test.mjs
python -m unittest discover -s tooling/tests -p test_seed_original_headwords.py -v
```

Coverage includes strict schemas/source-field rejection, immutable data,
headword/form ambiguity, case-sensitive homographs, checked-export gates,
SQLite integrity, CSV formula escaping and honest candidate counts. Structural
tests cannot establish comprehensive semantic correctness.
