# Wordbook · 我的英语词库

A standalone, local-first vocabulary organiser for Chinese-speaking English learners.

## What it does

- Accepts an English word or phrase only
- Checks likely spelling mistakes and shows the correction before saving
- Adds editable Chinese meaning, part of speech, pronunciation and examples
- Stores entries and review progress in browser IndexedDB
- Uses an explainable Leitner review schedule
- Exports and imports a complete JSON backup
- Keeps working when optional online dictionary services are unavailable

The first curated entry is `jab at`. Common misspellings such as `recieve`, `accomodate` and `enviroment` have a local correction fallback.

## Privacy and storage

Vocabulary data stays in the current browser. The app sends only the English term currently being organised to optional language services. Do not enter private information. Export a JSON backup before clearing browser data or changing devices.

## Online enrichment

- [LanguageTool](https://languagetool.org/) — spelling suggestions
- [FreeDictionaryAPI](https://freedictionaryapi.com/) / Wiktionary — English definitions, IPA and examples
- [MyMemory](https://mymemory.translated.net/) — editable machine-translation candidate

No API key or secret is stored in the frontend.
