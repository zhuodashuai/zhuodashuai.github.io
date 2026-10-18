# Credited bilingual lookup release — 2026-10-18

## What is included

The member/GitHub-owner personal wordbook now supports English lookup and
Chinese reverse lookup. Search does not automatically add cards. The existing
private save, duplicate, learning and review contracts remain unchanged.

The release has **82,920 canonical spellings** (including phrases and some
lexicalized/inflected entries), **121,031 English lookup keys** and **139,009 Han
index tokens**. Keys, forms, senses and tokens are not additional headwords.
There is one exact-case collision (`iPhone`/`iphone`), retained rather than
silently losing a source meaning; personal saving still uses its existing
canonical duplicate key. This is not a claim of 82,920 distinct English lemmas.

- 82,689 source records with complete retained ECDICT Chinese gloss text,
  pinned to commit `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`, under MIT.
- 7,499 usable existing core rows; three rows lacking Chinese stay explicitly
  excluded, not fabricated. Existing editorial corrections stay primary.
- All 616 current public cards and 520 reading-context aliases, without editing
  their content or private review identities.
- All 1,030 hash-review-backed original entries as separate selected-sense
  variants, labelled AI-reviewed, not human-certified or an exhaustive dictionary.

These source counts overlap and must not be summed. Source variants preserve
other parts of speech instead of replacing a whole entry with a partial sense.
The original 70,000-entry writing project remains unfinished. Example sentences
are not required for this lookup release and are not in the critical-path shards.

The supplied workbook contains **42,998 actual main-table headwords** in
`A7:A43004`, despite a 41,746-item cover claim. Of these, **34,223** have usable
exact licensed matches; **8,775** remain uncovered (8,757 not found and 18 without
a usable Chinese gloss/contract). Its candidate-form sheet has 4,268 rows,
3,336 unique labels and 932 duplicates; 3,237 unique candidates independently
match usable licensed entries, and 99 do not. The two sheet match sets overlap.
Across both sheets, 37,459 distinct licensed records carry a workbook marker.
Unmatched candidates are not published as empty or invented definitions.

The source preparation reads only workbook column A. **No publisher definitions,
examples, source PDFs or source workbook are uploaded.** 24,479 prepared records
have no defensible source POS label and show “词性未标注”; the builder does not
invent grammatical categories. Complete gloss retention is a provenance check,
not a human semantic accuracy certificate.

## Fast static search

The old compact hot-word index is retained. Rare English lookups read a small
manifest and a relevant English shard. If an old inflection match is also an
independent exact entry (for example `lettering` / `letter`), both are selectable;
the previous lemma remains the default rather than silently changing a saved
review identity. Chinese lookup intersects character/bigram postings, then
verifies actual Chinese substring matches in candidate glosses. A broad query
shows up to 20 ranked results; refine the query for more specific meanings.

There are 128 English and 128 Chinese immutable shards (about 47.65 MB **total**,
not downloaded wholesale at login). English shards are roughly 263–314 KB raw;
the browser loads only needed buckets and keeps a bounded public cache. Each
shard is checked for byte length and SHA-256 before parsing. Failed integrity
checks fail closed, with a cache-bypassing repair retry on the next query.
Only already downloaded/cached buckets work offline. First-time offline lookup
cannot download new data. No translation, spelling or AI provider is called.

## Rebuild and check

```text
node tooling/scripts/build-member-dictionary.mjs
node tooling/scripts/build-expanded-dictionary.mjs
node tooling/scripts/build-expanded-dictionary.mjs --check
```

First bootstrap uses `prepare-expanded-dictionary.py` against private workbook,
pinned CSV and headword queue paths, then `--prepared=<private prepared-input.json>`.
Private inputs and detailed unmatched audit stay outside the public repository.
Subsequent CI builds recover the licensed seed from the tracked shards and
verify the separate `expanded-source-integrity.json` semantic root before
combining current core/public/catalogue data. Editing a gloss and recalculating
its shard and manifest hashes does not pass this independent root.

The MIT licence is included in `vocab/data/expanded-dictionary/ECDICT-LICENSE.txt`.
`source-audit.json` has public counts, source hashes, balanced omissions and
exhaustive English-reference/Han-posting verification, not private source paths.

## Verification and rollback

Automated coverage includes all licensed source records, every shard hash and
all canonical/form/Han references, plus UI queries, Chinese selection/save,
duplicates, draft preservation, source labels, 390px layout, offline reuse,
failure retry and logout races. The 100-query UI regression is pipeline coverage,
not 100% linguistic quality of the entire source dictionary.

Preserved baseline: Git `a515acaf391fcadd0d284fc191f71318d4f05897`, Worker
application `2.4.4`, deployment `b23fd88c-0d39-4d70-a427-0c2028f6f69b`.
Rollback restores that Worker deployment and reverts this release's code merge;
it must not restore old private account databases, reset public vocabulary edits,
force-push history or erase users' learning records.
