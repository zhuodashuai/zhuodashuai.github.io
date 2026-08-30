# Qianjun Zhuo — Academic Profile

A lightweight, accessible academic profile for GitHub Pages.

## Repository map

- `/` — academic profile and GitHub Pages homepage
- `/vocab/` — installable **Wordbook** PWA with a public read-only collection and a separate server-authenticated owner control room
- `/vocab/guide.html` — Wordbook user guide; operational explanations live here instead of crowding the editor
- `/wordbook-api/` — authenticated Worker API and publishing logic
- `/tests/` and `/scripts/` — active verification and maintenance tooling
- `/docs/` — deployment notes plus clearly marked historical QA archives
- `/U1L1_coding.ipynb` — existing coursework notebook, retained in its original location

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

Wordbook formats multiple Chinese senses consistently in the Owner list, public cards and detail view. The Owner may type ordinary `1.` / `2.` (also `1)` / `2)` or `1、` / `2、`); the interface displays them as `①` / `②` without rewriting the stored or exported meaning. A single sense stays unnumbered.

Published entries reach the public reader through a schema-validated, read-only Worker snapshot as soon as GitHub confirms the write, without waiting for a GitHub Pages rebuild. Visible public tabs refresh on focus, reconnect and every 30 seconds; the deployed Pages JSON and IndexedDB remain validated fallbacks. Public app-code updates activate automatically, while the Owner editor keeps its draft-safe confirmation gate.

The first production phase intentionally does not expose a visitor personal-wordbook editor. Owner publishing is served from a same-origin Cloudflare Worker and uses server-side GitHub App OAuth, a Secure HttpOnly session, strict account/repository IDs, CSRF protection and Git blob SHA concurrency. No PAT, GitHub write token or AI key is accepted by or stored in the browser. See `docs/wordbook-owner-v2.md` for the security model and one-time deployment setup.

## Publishing

GitHub Pages publishes `index.html` from the configured branch. Review factual details and dates before pushing updates.
