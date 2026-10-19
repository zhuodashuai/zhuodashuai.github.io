# Credited bilingual lookup release history

## Workbook supplement — 2026-10-19 / application 2.6.4 / shell v87

Current lookup coverage is **102,609 canonical spellings**, **140,862 English
keys**, and **160,071 Han index tokens**. The 30,000-row supplied batch covers
19,689 new heads and 10,311 reused heads; it does not add 30,000 duplicates.
Existing 82,920 canonical records, source variants, 616 public cards, 520 reading
aliases and 1,030 original entries are preserved. Headwords are not senses or
necessarily distinct English lemmas; the previous iPhone/iphone case distinction
is retained.

Of the new heads, 19,636 use pinned, credited MIT ECDICT Chinese glosses and 53
use separately labelled editorial explanations with per-entry public references.
The latter include 51 selected specialist terms plus corrected fan mail and
stuffed mushroom records: the licensed source contained corrupt Chinese or a
hidden control character in those two rows. Existing preferred meanings are
not overwritten. The MIT seed now contains 102,325 rows. New MIT rows without
defensible POS labels remain unlabelled (17,115); WordNet English POS is never
borrowed to pretend that unaligned Chinese senses have a verified category.

Only workbook rows 43005–73004 are this new batch. Older commercial-dictionary
definitions in rows 7–43004 are excluded. The original Excel and private
preparation stay outside the public repository and remain unchanged. English
WordNet reference definitions remain in the workbook/private preparation: they
are not published as sense-aligned definitions or new original examples.
This import adds headword/POS/Chinese lookup coverage, not 30,000 new examples
or a human linguistic certification of all source meanings.

The schema remains version 2 with five source IDs, compatible with the deployed
v82 lookup parser. Supplemental sources have their own independent semantic
root and an escaped static reference page. All English and Han references are
checked, and builds recover the MIT seed from tracked shards against its
separate root without access to private Excel files. Public queries use only
first-party static data; no paid API, online translation, or account database
migration is introduced. Example sidecars remain separate and unchanged:
18,821 heads / 20,210 bilingual examples, with their existing review labels.

Rollback baseline: Git `25f3e968d4c50bcdf72759b12b667cc3f267682e`, tree
`e8efd98f1da49baaa86e2f22e6419d32086e15bf`, Worker application 2.6.3,
deployment `2b683079-1afb-4edb-ab96-a908e593c63e`. The previous immutable
dictionary shards are retained. Restore code/assets or the previous Worker
deployment if needed; never roll back private account/learning databases or
overwrite subsequent public-card edits.

## Original bootstrap release — historical 2026-10-18

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

### Entry-speed and optional examples — application 2.5.2 / shell v81

Member English lookup now starts the compact and expanded public sources in
parallel. A stalled compact prewarm cannot block a successful expanded match
for its former 20-second deadline. Existing inflection/ambiguity rules stay in
place; a complete exact core/public projection can return immediately only
where its POS and Chinese text match the compact projection. Chinese queries
first use the shared compact reverse index when available. These are explicitly
labelled **basic**, not complete; “搜索完整词典” remains available for all indexed
matches, without changing the selected word or blocking use/save in the meantime.
Successful entry-list loading no longer waits for the independent learning read.
Scores, study and backups still require verified, loaded learning records.

The optional `data/dictionary-examples/` sidecar contains **1,230 headwords**,
**2,617 selected senses** and **2,619 bilingual examples**: 2,419 earlier original
examples plus 200 newly composed examples. The 200 new rows have separately
authored, content-hash-bound AI reviews. This is not human certification or
82,920-headword example completion: **81,690 heads remain without this sidecar**.
Existing chapter examples and book quotations are not overwritten. Each example
keeps its own POS and selected Chinese meaning rather than being attached to an
unrelated primary licensed sense. The public dictionary loads the optional JS
and one checksummed shard only after its main meaning and add-to-book link are
ready. Missing examples stay hidden; failure has its own retry and never reruns
or invalidates the primary lookup. No provider request is involved.

Rebuild/check with `node tooling/scripts/build-dictionary-examples.mjs` and
`node tooling/scripts/build-dictionary-examples.mjs --check`. Independent review
records and source compositions live under `tooling/dictionary/examples/`.
The keyed manifest is intentionally bounded for this batch, not an assertion
that the same key layout will scale unchanged to the final full catalogue.

Before this release, the preserved baseline is Git main
`7f3a79839539855e09135b6a69bde051de9cc1f6`, tree
`af374873fd54aaf219b7ed738cc3f449e76c90b9`, Worker application `2.5.1`, deployment
`7aee3580-2327-4ce1-9927-eece0105fd3f`. Restore that Worker version and revert the
code merge if necessary; never restore old account databases or learning data.

### Connected entrances — application 2.5.1 / shell v80

`vocab/dictionary.html` exposes the already-public index without requiring an
account. English and Chinese searches use first-party static GETs only. The
home page deliberately remains a search of published learning cards, now labelled
“搜索已收录词卡”, with a permanent “中英查词” entrance and a missed-card link that
passes the query as `#q=`, never an API query parameter. Public lookup is not a
claim that every workbook row has a licensed definition.

The dictionary's personal-book link passes only a bounded `#lookup=` fragment to
the fixed authentication origin. After login it prefills the search field once;
it does not search, fill an editor, save a card or call AI. Ordinary registration
and the owner's original GitHub identity remain separate. GitHub login opens in
a new tab so the original pending lookup survives; return and use “重新确认”.

The owner AI editor now has an independent expanded-dictionary preview when the
old core has no exact match or fails. It preserves source labels, refuses to
choose an ambiguous form, never writes fields, and cannot revive a busy state
after AI completion, logout or a later editing run. Strict AI sense validation
and publishing gates are unchanged. Search-only visitors never enter this AI
path. No dictionary data, published cards or private records changed in 2.5.1.

Before this entrance-only release, the preserved baseline is Git main
`370673f1b62302f35b1b236eebdb80598d3e65b6`, tree
`a767e11e6659d31247269307b66663f4a7513576`, Worker application `2.5.0`, deployment
`de4237fe-decb-41bf-a095-dbeaaca28fdc`. Revert this code release or restore that
Worker version if necessary; never roll back account databases or learning data.

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
