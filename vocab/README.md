# Wordbook · 公开词库与我的英语词库

A standalone, local-first vocabulary organiser for Chinese-speaking English learners.

## What it does

- Opens in a read-only public collection and lets visitors copy entries into a separate personal collection
- Accepts an English word, phrase, quotation or proverb
- Checks likely spelling mistakes and shows the correction before saving
- Adds editable Chinese meaning, part of speech, pronunciation and examples
- Searches Wikiquote for quotation-attribution candidates without presenting them as verified facts
- Stores entries and review progress in browser IndexedDB
- Uses an explainable Leitner review schedule
- Exports and imports a complete JSON backup
- Installs as a desktop PWA and keeps its main interface available offline
- Optionally backs up a conflict-protected snapshot to a user-owned private GitHub repository

The first curated entry is `jab at`. Common misspellings such as `recieve`, `accomodate` and `enviroment` have a local correction fallback.

## Data boundaries

- `data/owner-wordbook.json` is the public, read-only collection published with GitHub Pages.
- Personal entries, review history and notes stay in the current browser unless the visitor explicitly exports or synchronises them.
- GitHub sync is optional and targets a private repository chosen by that visitor.
- The fine-grained GitHub token is kept only in JavaScript memory for the current app session. It is never written to IndexedDB, Cache Storage, source files or exports.

Use a dedicated private repository, grant only `Contents: read and write` to that repository, and use a short token expiration. A remote file that changed since the previous sync is never silently overwritten.

This is snapshot backup rather than automatic multi-device merging: pulling asks for confirmation and replaces the local collection; pushing stops if the remote SHA changed. Optional automatic backup waits 30 seconds after the latest local change to avoid creating a commit for every click.

Git commit history retains older snapshots. Do not put sensitive personal notes into a synchronised vocabulary entry.

## Install and offline use

Open `/vocab/` over HTTPS in Chrome or Edge and choose **Install Wordbook**. The installed app starts in personal mode and creates a desktop/start-menu shortcut. The interface, local entries and public collection can work offline after the first successful load; spelling, dictionary, translation, quotation search and GitHub sync still require a network connection.

## Privacy

The app sends the current English content, and any dictionary example that needs translation for that lookup, to the relevant optional language or source-search services. Do not enter private information. Export a JSON backup before clearing browser data or changing devices.

## Online enrichment

- [LanguageTool](https://languagetool.org/) — spelling suggestions
- [FreeDictionaryAPI](https://freedictionaryapi.com/) / Wiktionary — English definitions, IPA and examples
- [MyMemory](https://mymemory.translated.net/) — editable machine-translation candidate
- [Wikiquote](https://en.wikiquote.org/) — community-maintained attribution candidates, always marked unverified until checked against a primary source

No API key or secret is stored in the frontend.
