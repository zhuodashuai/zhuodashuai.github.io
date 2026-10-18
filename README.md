# Qianjun Zhuo — Academic Profile

A lightweight, accessible academic profile for GitHub Pages.

> Unreleased capture prototype on `codex/marked-photo-pdf-import`: **do not deploy or merge this branch yet**. Upload/preview/storage/security tests pass, but an independent two-photo holdout missed all six primary marked expressions and produced one unmarked candidate. A single general illumination-calibration attempt also failed. The current automatic mark detector is not release-ready; the live site has deliberately not been replaced. Synthetic UI tests and previously used development photographs are not evidence of general OCR/mark accuracy.

## Repository map

Synonym grouping and automatic recognition are temporarily paused after incorrect associations were found. Public readers use one canonical vocabulary card per entry; historical relation data is retained but not displayed or regenerated. The authenticated scan endpoint returns `409 synonym_feature_paused` without using AI or writing to GitHub. Vocabulary, original examples, chapter quizzes, favorites and review records are unaffected.

- `/` — academic profile and GitHub Pages homepage
- `/vocab/` — installable **Wordbook** PWA with a public read-only collection and a separate server-authenticated owner control room
- `/vocab/guide.html` — Wordbook user guide; operational explanations live here instead of crowding the editor
- `/vocab/capture.html` — GitHub-owner-only photo/PDF marked-word capture, with local page previews and explicit candidate-to-draft confirmation
- `/wordbook-api/` — authenticated Worker API, publishing logic and deployment documentation
- `/tooling/` — tests, maintenance scripts and the Playwright configuration
- `/U1L1_coding.ipynb` — coursework notebook retained at its published Colab-compatible URL

The public tools are intentionally separated by directory so changes to Wordbook do not alter the academic profile.

## Content structure

- Research profile and current affiliations
- Research interests
- Selected quantitative work
- Education and affiliations
- Teaching, professional development and service
- Recognition, methods and contact details
- Public suggestion box and guestbook powered by GitHub Issue Forms

The Education section uses current institutional marks sourced from the official [UNSW Sydney](https://www.unsw.edu.au/content/dam/images/graphics/logos/unsw/unsw_0.png) and [University of Pennsylvania](https://www.upenn.edu/themes/custom/penn_starter/assets/img/UPenn-logo.svg) websites. They identify the listed affiliations only; this remains a personal profile and is not an official university publication.

The site intentionally distinguishes coursework and modelling projects from formal publications. Add publication, paper, report, code, CV, ORCID or Google Scholar links only when a verified public URL is available.

## Feedback and guestbook

The public suggestion box and guestbook are defined in `.github/ISSUE_TEMPLATE/`. Visitors need a GitHub account to submit a message, and every submission is public. Private or sensitive messages should be sent by email instead.

## Local preview

Open `index.html` directly, or serve the repository with any static file server.

Wordbook uses JavaScript modules and IndexedDB, so preview it through a local server at `/vocab/` rather than opening its HTML file directly.

Marked-word capture renders PDFs locally with pinned, self-hosted PDF.js (`pdfjs-dist@6.4.299`, Apache-2.0), detects blue/red underlines, and reads candidate text in a local Tesseract 7 English WebAssembly worker. Reproduce the licensed browser assets with `node tooling/scripts/vendor-pdfjs.mjs` and `node tooling/scripts/vendor-tesseract.mjs`; no runtime CDN, cloud vision provider or image-upload API is used. The first OCR run downloads fixed public engine/language files; uploaded pages and recognized text stay on the device. Only explicitly confirmed drafts can later be reviewed and published through the existing owner workflow. Every candidate starts unchecked; local dictionary glosses remain references, not verified chapter translations. Recognition remains fallible, especially for faint/black/mixed markings, curved pages and broken words. See the guide for supported marks, limits and privacy details.

Wordbook formats multiple Chinese senses consistently in the Owner list, public cards and detail view. The Owner may type ordinary `1.` / `2.` (also `1)` / `2)` or `1、` / `2、`); the interface displays them as `①` / `②` without rewriting the stored or exported meaning. A single sense stays unnumbered.

Book-based reading lists live under `vocab/data/reading-lists/`. `Never Let Me Go` Chapters 1–5 are kept as reviewed 29-item, 38-item, 28-item, 51-item and 18-item source files and imported with `node tooling/scripts/import-reading-list.mjs --source=<chapter-file>`. Chapters 3–5 were manually checked against the supplied book-page photographs; the photographs themselves are not published. Chapter 3 contains the original 16 marked items plus 12 approved additions balancing useful expressions with writing and descriptive vocabulary. Chapter 4 covers pp. 37–48 and contains the original 11 marked items plus 40 explicitly approved additions. Chapter 5 covers pp. 49–60 and contains four visibly marked items plus 14 selectively reviewed additions, balancing writing, literary reading, familiar-word senses and practical expressions. The earlier broad 159-item import was narrowed at the owner's request; that candidate list remains recoverable from Git commit `82cd6b7` and an external local backup, not in the active review queue. The 18 retained cards keep their original IDs; the four previously shared cards remain in their earlier chapters, with only the unselected Chapter 5 membership/context removed. No browser-local review records are cleared. Its optional per-context `order` preserves source reading order without moving cards in older chapters. Supplied British IPA is preserved; unverified IPA is not invented. Notes distinguish marked text from supplementary selections. Examples are written for learning and are not quotations from the novel.

The importer preserves the canonical term, page and form seen in the text, assigns the book/chapter membership and source, refuses ambiguous cross-book duplicates, and is safe to rerun without creating duplicates. Pages may be single numbers, ranges such as `41–42`, or nonconsecutive references such as `40, 45`; malformed, repeated or out-of-order references are rejected before writing. Reviewed source corrections update content owned by that chapter. An optional `phonetic` string (up to 300 characters, trimmed on import) updates a chapter-owned entry's IPA; omission preserves an existing value and defaults a new entry to empty. A repeated headword with the same sense across chapters keeps one canonical card and review identity while `readingContexts` preserves each chapter's distinct form, page and explanation. In the public reader, each book and chapter has its own view and review queue; Chinese glosses and the active chapter context are displayed as separate learning points.

Published entries reach the public reader through a schema-validated, read-only Worker snapshot as soon as GitHub confirms the write, without waiting for a GitHub Pages rebuild. Visible public tabs refresh on focus, reconnect and every 30 seconds; the deployed Pages JSON and IndexedDB remain validated fallbacks. Public app-code updates activate automatically, while the Owner editor keeps its draft-safe confirmation gate.

Original book examples are a separate, read-only layer in `vocab/data/book-passages.json`: existing authored `exampleEn`/`exampleZh`, canonical IDs and chapter contexts are unchanged. The supplied electronic PDF was decoded using its declared font encoding and checked against rendered pages; every excerpt is an exact, whitespace-reflowed substring of its assigned chapter. The current 653 chapter memberships have 595 deduplicated source examples, and the separate reading view features one short selected sentence per chapter (23 total). Visible source labels show only book, author and chapter; edition-specific page metadata is retained for internal verification, not displayed to readers. Only reviewed excerpts are published; the supplied PDFs, full-text extraction and private audit material are not in the repository. New source excerpts must be checked before adding them, not generated or silently substituted for learning examples.

Featured passage favorites are device-local IDs in their own versioned storage key, with an explicit IDs-only export/merge-import. They are not account-cloud records, do not modify vocabulary or quiz/review scheduling, and are not part of the existing learning-record backup. Missing source data never blocks the original wordbook. The service worker refreshes the excerpt data online and keeps a cached offline copy.

Ordinary accounts have a private wordbook: choose published books/chapters or look up basic parts of speech and Chinese meanings in the packaged 7,500-entry ECDICT snapshot. Dictionary queries download only a first-party static data file; there is no online dictionary, translation, spelling or AI-provider fallback. Entries and spaced-review records are saved separately for each account through the site's own authenticated service. Unknown words are reported honestly, not generated. The owner keeps the existing GitHub login and full publishing workflow; members cannot publish or use owner AI services. See `vocab/guide.html` for usage and current limits.

Owner publishing is served from a same-origin Cloudflare Worker and uses server-side GitHub App OAuth, a Secure HttpOnly session, strict account/repository IDs, CSRF protection and Git blob SHA concurrency. No PAT, GitHub write token or AI key is accepted by or stored in the browser. See `wordbook-api/README.md` for the security model and one-time deployment setup.

## Publishing

GitHub Pages publishes `index.html` from the configured branch. Review factual details and dates before pushing updates.
