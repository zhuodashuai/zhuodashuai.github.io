# Development tooling

This directory keeps non-runtime project support out of the repository root:

- `tests/` contains unit, live-provider and browser end-to-end tests.
- `scripts/` contains maintenance, migration and quality-report utilities.
- `playwright.config.mjs` configures browser testing.

Run the documented `pnpm` commands from the repository root. The production
GitHub Pages site remains in `/` and `/vocab/`; the Cloudflare Worker remains
in `/wordbook-api/`.
