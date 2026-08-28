# Third-party notices

## ECDICT

`ecdict-core.json` is a deterministic, compact subset generated from the
[ECDICT English-Chinese dictionary database](https://github.com/skywind3000/ECDICT).
It contains dictionary headwords, phonetics, English and Chinese definitions,
frequency metadata and word forms. ECDICT is distributed under the MIT License;
the upstream license text is preserved in `ECDICT-LICENSE.txt`.

The compact subset contains a small, human-reviewed editorial layer for
ambiguous learner words and high-frequency phrasal verbs. It puts the general
anatomical noun sense of **hip** (髋部；臀部), core senses of polysemous words,
and ordinary meanings of phrases such as **look after** (照顾) ahead of dated or
specialist senses. It also supplies a handful of modern, proper-name and
technical forms that are absent or inconsistently cased upstream (for example
**COVID-19**, **iPhone**, **24/7** and **C++**). These overrides and additions
belong to this wordbook project, not to upstream ECDICT.

## Wiktionary / FreeDictionaryAPI

Live pronunciation, forms, examples and sense data may be supplemented through
[FreeDictionaryAPI](https://freedictionaryapi.com/), whose content is sourced
from Wiktionary under CC BY-SA 4.0. Each saved entry retains the source page URL
returned by the API. See the provider's attribution requirements for details.

## MyMemory

MyMemory may be used only to produce explicitly labelled machine-translation
candidates for longer quotations, definitions or example sentences. Its output
is never treated as a trusted dictionary definition for an isolated word or
short phrase.
