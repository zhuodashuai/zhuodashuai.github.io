# Development tooling

This directory keeps non-runtime project support out of the repository root:

- `tests/` contains unit, live-provider and browser end-to-end tests.
- `scripts/` contains maintenance, migration and quality-report utilities.
- `playwright.config.mjs` configures browser testing.

Run the documented `pnpm` commands from the repository root. The production
GitHub Pages site remains in `/` and `/vocab/`; the Cloudflare Worker remains
in `/wordbook-api/`.

## Incremental dictionary examples

Reviewed example sources and hash-bound independent AI reviews are kept in
`dictionary/examples/`; the explicit index is the publication gate. New examples
are selected-sense learning material, not a claim of exhaustive dictionary or
human editorial review. Licensed definitions and chapter quotations stay separate.

```powershell
node tooling/scripts/prepare-dictionary-example-batch.mjs C:/private/next-batch 2400 0004
node tooling/scripts/build-dictionary-examples.mjs
node tooling/scripts/build-dictionary-examples.mjs --check
```

The first command only prepares an uncovered-headword queue; it does not write or
approve examples. Author sources and independent reviews before updating the index.
The v2 example reader uses a constant-size directory and 256 on-demand hash buckets,
so adding examples does not require downloading a full headword index. Existing v1
assets remain available for already-open clients. Meaning lookup does not wait for
examples. The 80,890-head capacity fixture tests transport only, not authored content.
