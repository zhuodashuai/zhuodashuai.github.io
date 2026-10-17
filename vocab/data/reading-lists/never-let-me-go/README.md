# Never Let Me Go reading vocabulary

The public wordbook covers Chapters 1–23. Lists preserve short original forms,
printed page references, numbered Chinese meanings, English definitions,
chapter-local explanations and self-written bilingual learning examples.
Original photographed pages, PDFs and full OCR text are not published here.

## Remaining-chapter import, 2026-10-17

Source: the owner's `Never_Let_Me_Go_Merged_Deduplicated.pdf`, 136 photographed
pages. The supplied printed pages are 144–199 and 203–282. Pages 200–202 are
not supplied; their contents are unknown and no entries are invented for them.

| Chapter | Printed pages | Selected items |
| --- | --- | ---: |
| 13 | 144–153 | 26 |
| 14 | 154–165 | 29 |
| 15 | 166–181 | 27 |
| 16 | 182–193 | 25 |
| 17 | 194–199 | 23 |
| 18 | 203–213 | 29 |
| 19 | 214–232 | 29 |
| 20 | 233–240 | 25 |
| 21 | 241–250 | 28 |
| 22 | 251–270 | 30 |
| 23 | 271–282 | 30 |
| **Total** | | **301** |

These 301 chapter memberships add 272 new card identities and reuse 29
same-sense identities from earlier chapters. The complete book has 609 unique
cards and 653 chapter memberships; chapter counts therefore need not sum to
the unique-card count. The seven non-book cards remain unchanged.

Selection tags distinguish `划线词` (marked vocabulary), `划线句提取` (a short
learning unit extracted from a marked sentence), and `补充阅读` (selected
supplement). Useful writing vocabulary, literary descriptions, idioms and
familiar words with less familiar meanings are all included. Counts are not a
quota; annotations are not a claim that every unmarked word was unknown.

## Safe maintenance

Run from the repository root:

```sh
node tooling/scripts/import-reading-list.mjs --source=vocab/data/reading-lists/never-let-me-go/chapter-13.json --check
```

Omit `--check` to import a reviewed source. Import chapters in numeric order;
cross-chapter reuse must explicitly declare `reuseExistingSameSense: true`.
The importer preserves existing IDs and earlier reading contexts. Repeated
imports are idempotent. Chapter quizzes and review histories are stored
separately and are not reset by these data imports.

Regression coverage: `vocab/tests/remaining-chapters-import.test.mjs` checks
source coverage, old-card preservation, chapter projections, randomized
four-option tests, size limits and byte-stable repeated imports. Browser
coverage is in `tooling/tests/e2e/remaining-chapters.spec.mjs`.
