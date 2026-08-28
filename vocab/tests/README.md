# Vocabulary quality assets

These tests use only the public 100-case gold dataset in
`../quality/datasets/vocab-100.json`. They do not open the personal IndexedDB
wordbook, read GitHub synchronization settings, or use an access token.

- `npm test` runs the deterministic provider, 100-case accuracy, duplicate,
  concurrency, dataset, and published-report checks.
- `npm run test:live` separately verifies the current FreeDictionary,
  MyMemory, and LanguageTool contracts so a temporary provider outage cannot make the
  deterministic suite flaky.
- `npm run report:vocab:init` resets `../quality/generated-report.json` to an
  explicitly pending report. It does not run the vocabulary pipeline and must
  never mark a case as passed.

The committed passing report is based on observed deterministic and browser
runs. `report:vocab:init` remains available only to reset it to pending before
a future full audit. Live external API checks remain separate from the
deterministic suite.
