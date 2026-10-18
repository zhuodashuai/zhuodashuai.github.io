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

The source catalogue currently has **1,030 independently written entries**: the
original 30-entry pilot, the 300-entry batches `0002`, `0003` and `0004`, and the
100-entry PDF-headword batch `0005`. Together they contain **2,417 selected senses
and 2,419 original bilingual examples**. Authors composed definitions and examples
without consulting supplied PDF entries, existing definitions or publisher
examples. For batch `0005`, a separate selector supplied only visually checked
headword names from ten rendered PDF pages. A separate AI
review found no known substantive language errors; this is **not** human
approval or proof of originality. Author files remain drafts. Hash-bound sidecar
reviews can promote a separately compiled copy to `checked`, explicitly naming
the AI reviewer; this is not human approval. Missing senses,
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
- `dictionary-draft.json`: strictly validated local writing, retaining each
  compiled entry's draft or AI-checked label; neither label releases the bundle.
- `zhuo-dictionary-draft.sqlite`: indexed local candidates, entries, senses,
  examples and aliases. Default lookup excludes draft meanings. `--draft` is a
  deliberate editorial-only preview, not a production integration.
- `checked-content.json`: local records backed by content-hash-bound review
  evidence, with the AI reviewers explicitly named. These are not yet released.
- `public-ready.json`: **empty until every target headword is written and
  checked, with a minimum target of 70,000**. The owner chose to finish the whole
  library before any production upload. Checked small batches cannot bypass this
  separate release gate. No upload or deployment happens here.
- `build-report.json`: counts and incomplete-coverage flags, not a quality badge.

CSV is currently an editing/export view. There is **no CSV re-importer**; edit
the source JSON and rebuild rather than assuming workbook edits have changed the
database. Neither tool modifies the existing ECDICT snapshot or user records.

Exact case-sensitive headwords win; otherwise all matching folded headwords and
forms are returned. Collisions stay ambiguous. There is no fuzzy correction,
substring meaning selection or silent conflation. A registered but unauthored
candidate returns `candidate-only`, never a fabricated definition.

## Batch catalogue and review evidence

`source/index.json` lists the real authored packs. New batches do not overwrite
old cards or silently merge a repeated canonical spelling. A group such as
`verbs` is an assignment aid, not a restriction on the word's other common parts
of speech. Review-driven additions in `batches/0002-review-additions.json`
include academic/fair nouns, brief/calm verbs and the electrical sense of current.
Batch `0003` adds another 300 non-overlapping headwords with 740 selected senses
and 742 original bilingual examples. Independent review repairs include the
bright-room sense of light, the average adjective sense of mean, the plural
forms firsts/foci, and a water-quality-sensor example whose English and Chinese
must describe the same device. The 100-headword groups are editorial assignments,
not a limit to one part of speech.
The go card also distinguishes the be going to future construction from physical
movement, with separate examples of an intention and an evidence-based prediction.

Batch `0004` adds 300 more non-overlapping headwords, 873 selected senses and
873 original bilingual examples. It distinguishes lie/lay/lain from lie/lied,
lead/led from the metal lead, live's verb and adjective pronunciations, and the
let/make/need constructions. Noun cards preserve countability and forms such as
feet and halves; plenty and several retain their quantity-related parts of speech
rather than being forced into adjective labels. Review refinements clarify
elder/eldest restrictions, hospital articles when referring to a patient, and
precise translations of fronting a campaign and a station's future. The existing
630 canonical cards were preserved, not regenerated.

Batch `0005` adds 100 non-overlapping headwords, 198 selected senses and 198
original bilingual examples. A separate selector visually checked the main
headwords on physical PDF pages 1500–1509, recording private page-level evidence
and the source hash. This is a bounded sample, not a complete index of that PDF
or all six supplied dictionaries. Authors received headword names only, then
independent reviewers checked all 100 entries. Outwards stays a variant of outward
rather than becoming another canonical card. Review refinements include natural
Chinese for outpatient and overnight and aligned examples for outpace,
overcompensate and overkill. The previous 930 canonical cards are unchanged.

Of the fixed 70,000 candidate heads, 1,023 now have writing and AI cross-review;
68,977 remain unwritten. The 1,030-card total includes five phrases and two other
word entries outside that candidate queue; those seven cards do not inflate
target-headword progress. All source packs remain drafts; only separately
compiled copies carry the hash-bound AI review label. No partial batch is deployed.

Every authored sense includes its part of speech, original Chinese and English
definitions, and a bilingual original example. This batch already has examples;
future examples can be enriched gradually, without using blank placeholders as
completed records. No claim of exhaustive senses is made.

`reviews/` records independent AI cross-checks, approved IDs, findings and a
canonical SHA-256 over the actual headwords, forms, definitions and examples.
Changing semantic content invalidates old evidence. Missing evidence cannot
promote an author's self-labelled status. The digest is a stale-content guard,
not a digital signature or a guarantee of correctness or originality.

The compiler loads the catalogue and reviews by default. `--source` still lets
an author preview one draft pack but cannot accept self-promoted checked rows.
Progress reports count word entries, phrase entries, actual written senses,
examples and candidate coverage separately. The 70,000-headword queue is never
mistaken for 70,000 completed definitions.

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
node --test tooling/tests/original-dictionary-catalogue.test.mjs tooling/tests/original-dictionary-batch-data.test.mjs
node --test tooling/tests/original-dictionary-batch-0003-data.test.mjs
node --test tooling/tests/original-dictionary-batch-0004-data.test.mjs
node --test tooling/tests/original-dictionary-batch-0005-data.test.mjs
python -m unittest discover -s tooling/tests -p test_seed_original_headwords.py -v
```

Coverage includes strict schemas/source-field rejection, immutable data,
headword/form ambiguity, case-sensitive homographs, checked-export gates,
SQLite integrity, CSV formula escaping and honest candidate counts. Structural
tests cannot establish comprehensive semantic correctness.
