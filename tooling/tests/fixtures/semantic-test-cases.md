# English Wordbook QA Test Cases

This document is the human-execution companion to [`vocab/quality/datasets/semantic-qa.json`](../../../vocab/quality/datasets/semantic-qa.json). It defines expected language behaviour; it does not claim that local or live product execution has passed. Record actual output, Pass/Fail, screenshot, console log, network evidence, and storage/sync evidence during black-box runs.

## Execution rule

For every case:

1. Run it first against the live public/owner flow in a clean browser profile.
2. Save the visible output, screenshot, console messages, and relevant network response.
3. Compare every generated field semantically, not merely for presence.
4. Repeat locally after any fix.
5. Close a defect only after its regression test and the live retest both pass.

Severity meanings:

- **Critical** — unsafe execution, fabricated provenance, corrupted data, or broken authorization/integrity.
- **High** — wrong core meaning, silent incorrect correction, lost/duplicated data, or a broken primary workflow.
- **Medium** — incomplete linguistic handling or a clear but recoverable validation problem.
- **Low** — polish issue with no material semantic or data effect.

## Semantic quality rubric (`semantic-16-v1`)

Score each dimension `0`, `1`, or `2`:

- `0`: wrong, missing, irrelevant, or contradictory.
- `1`: partly correct but incomplete, weak, or unnatural.
- `2`: accurate, natural, sufficiently complete, and internally aligned.

| # | Dimension | Critical gate | What earns 2 |
|---:|---|:---:|---|
| 1 | Input recognition | Yes | Correctly distinguishes word, phrase, inflection, idiom, quotation, unsupported, and unsafe input. |
| 2 | Spelling judgment | Yes | Valid forms are preserved; mistakes receive the correct suggestion without silent replacement. |
| 3 | Common-sense priority | Yes | Frequent learner-relevant meanings appear before rare or specialized meanings. |
| 4 | Part of speech | Yes | Every sense has the correct POS or multiword construction label. |
| 5 | IPA | No | Accepted regional/POS variants are accurate; legitimate variants are not rejected. |
| 6 | Chinese definition | Yes | Natural, precise Chinese matches the exact English sense. |
| 7 | English definition | Yes | The definition genuinely explains the submitted word or expression. |
| 8 | Sense separation | Yes | Unrelated meanings and POS values are represented as separate sense records. |
| 9 | Example naturalness | No | The English example is grammatical and idiomatic. |
| 10 | Example-to-sense alignment | Yes | Each example unambiguously demonstrates its attached sense. |
| 11 | Example translation | Yes | The Chinese example translation preserves the English meaning and register. |
| 12 | Usage notes | No | Notes explain a real grammar, register, dialect, or collocation issue. |
| 13 | No duplicates | No | Repeated meanings, fields, and entries are absent. |
| 14 | Relevance | No | No unrelated dictionary fragment, translation residue, or filler appears. |
| 15 | Source integrity | Yes | Attribution is supported by a direct reliable source and never invented. |
| 16 | Internal consistency | Yes | Input, lemma, POS, IPA, definitions, examples, and source status agree. |

Passing threshold: at least **28/32**, with no fabricated source, incorrect core meaning, silent incorrect correction, sense/example mismatch, or `0` on any critical dimension. A hard failure cannot be offset by points elsewhere.

## 1. Polysemy

| ID | Input | Required result | Severity | Actual / evidence |
|---|---|---|---|---|
| polysemy-hip | `hip` | Valid word; `/hɪp/`; noun “髋部/髋关节” first; separate informal adjective “时髦的/了解最新潮流的”; optional lower-priority rose fruit; never only “屁股”. | High | Not run |
| polysemy-bank | `bank` | Separate financial institution and river-side nouns; secondary deposit/rely verb senses. | High | Not run |
| polysemy-charge | `charge` | Separate fee, accusation, charging/electricity, responsibility/attack senses and noun/verb uses. | High | Not run |
| polysemy-fair | `fair` | Separate fair/just adjective and public-event noun; allow pale/moderately good/clear-weather senses later. | High | Not run |
| polysemy-fine | `fine` | Separate satisfactory/high-quality adjective, monetary penalty noun/verb, and thin/delicate senses. | High | Not run |
| polysemy-light | `light` | Separate illumination/lamp noun, not-heavy adjective, pale/not-intense adjective, and ignite/illuminate verb. | High | Not run |
| polysemy-mean | `mean` | Separate signify, intend, unkind/stingy, and mathematical average concepts. | High | Not run |
| polysemy-issue | `issue` | Separate topic/problem, publication issue, and publish/supply; accept `/ˈɪʃuː/` and `/ˈɪsjuː/`. | High | Not run |
| polysemy-scale | `scale` | Separate size/range, weighing device, animal plate, musical scale, and climb/resize senses. | High | Not run |
| polysemy-pitch | `pitch` | Separate throw, sound frequency, sports field, and sales proposal; rare bitumen must not lead. | High | Not run |
| polysemy-draft | `draft` | Separate preliminary text, compose, conscription, and US air-current senses; explain UK `draught`. | High | Not run |
| polysemy-record | `record` | Separate information/history, best achievement, recording, and capture; noun/adj stress `/ˈrek…/`, verb `/rɪˈk…/`. | High | Not run |

### Permanent `hip` oracle

`hip` must remain a normal correctly spelled word. At minimum the result must contain:

1. **noun, priority 1** — body area at either side between waist and upper leg, or the hip joint; Chinese contains `髋部` or `髋关节` and may add `臀部两侧/胯部`.
2. **adjective, priority 2, informal** — fashionable or aware of current trends; Chinese such as `时髦的/时尚的/了解最新潮流的`.
3. **optional noun, lower priority** — fruit of a rose; Chinese `蔷薇果/玫瑰果`.

`/hɪp/` and `/ˈhɪp/` are acceptable representations. Every sense must have its own aligned English definition, Chinese definition, English example, and translated example.

### Multi-sense display regression

| ID | Input/scenario | Expected | Severity | Actual / evidence |
|---|---|---|---|---|
| display-existing-circled | Published `jab at` meaning already contains `①` and `②` | Owner list, public card and detail show exactly one `①` and one `②`; never double-number. | Medium | Automated unit + E2E |
| display-pos-lines | Published `hip` / `surveillance` meaning contains two POS-prefixed lines, including two repeated `noun` labels | Both senses appear in source order as `①` and `②`, and every per-sense POS label remains visible in Owner list, public card, detail and copied text. | High | Automated unit + E2E |
| display-owner-arabic | Owner types `1. 人工释义` and `2. 第二义` (also accept `1)` and `1、`) | UI displays `① 人工释义` and `② 第二义`; stored API and exported JSON retain the exact owner-authored text. | High | Automated unit + E2E |
| display-single-sense | Entry has one Chinese sense | Meaning remains unnumbered. | Low | Automated unit + E2E |
| display-detail-lines | Open a structured multi-sense entry such as `hip` | Each sense is a separate block; POS, Chinese meaning, English definition, every bilingual example pair, Usage, Register and forms are independent rows. At 375px they stack without horizontal overflow. | Medium | Automated E2E |

## 2. Multiword expressions

| ID | Input | Required result | Severity | Actual / evidence |
|---|---|---|---|---|
| multiword-jab-at | `jab at` | Preserve both words; primary pattern is a quick poke/prod or boxing jab toward a target. Do not steal the sole “criticize” meaning from the longer `take a jab at`. | High | Not run |
| multiword-look-up | `look up` | Search for information; situation improves; secondary visit/contact. Not only literal “look upward”. | High | Not run |
| multiword-take-off | `take off` | Remove; aircraft leaves ground; suddenly succeeds; leave. | High | Not run |
| multiword-break-down | `break down` | Machine stops; system/relationship fails; emotional collapse; divide/analyse. | High | Not run |
| multiword-come-across | `come across` | Find/meet by chance; give an impression. | High | Not run |
| multiword-account-for | `account for` | Explain/be the cause of; constitute a proportion. | High | Not run |
| multiword-figure-out | `figure out` | Understand/solve; calculate/determine. | High | Not run |
| multiword-put-up-with | `put up with` | Treat the inseparable three-word unit as “tolerate/忍受”. | High | Not run |

## 3. Misspellings

Every row must retain the submitted spelling and require a visible adopt/keep/edit decision. A confidence band must come from dictionary recognition, edit distance, and regional-variant exclusion; a hard-coded decimal is not evidence.

| ID | Input | First suggestion | Severity | Actual / evidence |
|---|---|---|---|---|
| misspelling-recieve | `recieve` | `receive` | High | Not run |
| misspelling-accomodate | `accomodate` | `accommodate` | High | Not run |
| misspelling-enviroment | `enviroment` | `environment` | High | Not run |
| misspelling-definately | `definately` | `definitely` | High | Not run |
| misspelling-seperate | `seperate` | `separate` | High | Not run |
| misspelling-occured | `occured` | `occurred` | High | Not run |

## 4. British and Australian spelling

All inputs below are valid. A US or preferred-Australian alternative may be shown, but the original must not be labelled misspelled or forcibly replaced.

| ID | Input | Expected variant handling | Severity | Actual / evidence |
|---|---|---|---|---|
| regional-colour | `colour` | Valid British/Australian; related US `color`. | High | Not run |
| regional-organise | `organise` | Valid British/Australian; `organize` also exists. | High | Not run |
| regional-learnt | `learnt` | Valid British/Australian past/past participle of `learn`; related `learned`. | High | Not run |
| regional-travelling | `travelling` | Valid British/Australian participle; US usually `traveling`. | High | Not run |
| regional-enrolment | `enrolment` | Valid British/Australian; US `enrollment`. | High | Not run |
| regional-judgement | `judgement` | Valid British/Australian alternative; Australian legal material often uses `judgment`. | High | Not run |
| regional-programme | `programme` | Valid British; Australian usage usually prefers `program`. | High | Not run |

## 5. Inflection and lemma

Canonical dedupe keys preserve the submitted surface form; lemma metadata is additional information and must not erase the input.

| ID | Input | Lemma relationship | Severity | Actual / evidence |
|---|---|---|---|---|
| inflection-hips | `hips` | `hip`, plural noun; body sense first. | Medium | Not run |
| inflection-went | `went` | `go`, past simple. | Medium | Not run |
| inflection-better | `better` | Comparative of adjective `good` or adverb `well`; isolated input is ambiguous. | High | Not run |
| inflection-children | `children` | `child`, irregular plural. | Medium | Not run |
| inflection-mice | `mice` | `mouse`, irregular plural; animal and computer-device senses may both apply. | Medium | Not run |
| inflection-studying | `studying` | `study`, present participle or gerund; exact syntax needs context. | Medium | Not run |
| inflection-written | `written` | `write`, past participle; also adjective in suitable context. | High | Not run |

## 6. Idioms

| ID | Input | Required non-literal meaning | Severity | Actual / evidence |
|---|---|---|---|---|
| idiom-spill-the-beans | `spill the beans` | Reveal secret information; `泄露秘密/说漏嘴`. | High | Not run |
| idiom-blessing-in-disguise | `a blessing in disguise` | An apparent misfortune that later brings benefit; `因祸得福`. | High | Not run |
| idiom-grain-of-salt | `take it with a grain of salt` | Do not believe completely; note UK `pinch of salt`. | High | Not run |
| idiom-hit-the-nail | `hit the nail on the head` | Identify the exact point/cause; `说中要害/说到点子上`. | High | Not run |
| idiom-under-the-weather | `under the weather` | Feel ill/not completely well; `身体不适`. | High | Not run |

## 7. Quotations and attribution

An accessible page that merely repeats a claim is not sufficient for `verified`. Verification requires a direct authoritative or primary source containing the wording and context.

| ID | Input | Required attribution result | Severity | Actual / evidence |
|---|---|---|---|---|
| quote-verified-fdr | `The only thing we have to fear is fear itself.` | `verified`; Franklin D. Roosevelt; *First Inaugural Address*; 4 March 1933; direct National Archives URL. | Critical | Not run |
| quote-misattributed-gandhi | `Be the change you wish to see in the world.` | `candidate` or `unverified`; may say “commonly attributed”, but must not verify the exact wording as Gandhi. | Critical | Not run |
| quote-no-reliable-source | `Courage grows quietly before anyone notices.` | `unverified`; blank author/work/date/source URL. | Critical | Not run |
| quote-deliberately-fabricated | `When violet clocks forgive the rain, the silent compass wakes.` | Deliberately synthetic QA sentence; `unverified`; all attribution fields blank. | Critical | Not run |

## 8. Normalization and deduplication

These are eight distinct interaction cases even though some intentionally repeat the same raw input. They must all resolve to canonical/dedupe key `hip`, while the submitted display form remains available in the draft or audit record.

| ID | Input/scenario | Expected | Severity | Actual / evidence |
|---|---|---|---|---|
| normalization-lowercase | `hip` | Resolve to existing canonical `hip`; no duplicate. | High | Not run |
| normalization-titlecase | `Hip` | Lookup/dedupe as `hip`; preserve display `Hip`. | High | Not run |
| normalization-uppercase | `HIP` | Lookup/dedupe as `hip`; preserve display `HIP`. | High | Not run |
| normalization-identical-repeat | Repeat `hip` | Resolve to the same entry. | High | Not run |
| normalization-trailing-punctuation | `hip!` | Strip only ordinary boundary punctuation for lookup; dedupe to `hip`. | High | Not run |
| normalization-wrapped-quotes | `"hip"` | Strip paired boundary quotes for lookup; dedupe to `hip`. | High | Not run |
| normalization-rapid-double | Submit `hip` twice rapidly | One unique entry and at most one winning mutation. | High | Not run |
| normalization-after-save | Save, then submit `hip` again | Open/update existing entry, never append another. | High | Not run |

## 9. Synonyms as entry metadata

同义词是卓已经亲自输入的词条之间的附属关系，不是模型扩写列表。未输入的 AI 候选必须丢弃；关系不能占用 canonical key，也不能把后来由卓亲自输入的词挡在词库之外。

| ID | Input/scenario | Expected | Severity | Actual / evidence |
|---|---|---|---|---|
| synonyms-unentered-rejected | 只输入 `alleviate`，AI 候选包含 `ease / mitigate / soothe` | 同义词为空，词库只增加 `alleviate`；候选不成为词条，也不可被搜索或导出。 | High | Automated E2E |
| synonyms-owner-whitelist | 已发布 `alleviate` 后，卓主动输入 `ease`；AI 候选为 `alleviate / lessen / relieve` | 只保留已输入的 `alleviate`；`lessen / relieve` 丢弃，`ease` 仍是第二条独立词条。 | High | Automated E2E + Worker integration |
| synonyms-exact-first | 搜索 `alleviate`，同时存在精确 `alleviate` 与 synonyms 含它的 `ease` | 两条均可命中，但精确 `alleviate` 必须排第一。 | Medium | Automated unit + E2E |
| synonyms-safety | 同义词包含未输入词、当前词、词形、易混词、中文、HTML/JS 或大小写重复 | 拒绝或安全过滤；发布快照不得引用不存在词条；句子、名言和谚语的同义词必须为空。 | High | Automated browser + Worker schema tests |

## 10. Boundary, adversarial, and race inputs

### Public freshness and safe app updates

| ID | Input/scenario | Expected | Severity | Actual / evidence |
|---|---|---|---|---|
| freshness-immediate-publish | Owner publishes while GitHub Pages has not rebuilt | Read-only Worker endpoint immediately returns the schema-validated new snapshot; public readers do not wait for Pages. | High | Automated Worker + E2E |
| freshness-open-tab | A public tab remains open while another entry is published | Focus, visible, online and 30-second foreground checks update cards/count without a full-page reload. | High | Automated E2E |
| freshness-no-rollback | Live source is unavailable and Pages fallback is older than the currently displayed snapshot | Keep the newer in-memory snapshot; never roll the entry count or revision backward. | High | Automated E2E |
| freshness-pwa-safety | New app code is available on public and Owner pages | Public reader auto-activates it; Owner requires explicit acceptance plus pre-activation and pre-reload draft flushes. | High | Automated unit + E2E |

| ID | Input/scenario | Expected safe behaviour | Severity | Actual / evidence |
|---|---|---|---|---|
| adversarial-empty | empty string | Reject before network work; clear message; loading ends. | Medium | Not run |
| adversarial-spaces | three spaces | Trim for validation and reject; no blank draft. | Medium | Not run |
| adversarial-single-letter | `a` | Accept as a valid word; never reject solely by length. | Medium | Not run |
| adversarial-overlong | 4,097 `a` characters | Enforce documented limit or deliberate quote routing; never silently truncate. | High | Not run |
| adversarial-numbers | `12345` | Explicit unsupported/manual path; no invented English entry. | Medium | Not run |
| adversarial-emoji | `🧠✨` | Explicit unsupported/manual path; no crash or invented headword. | Medium | Not run |
| adversarial-chinese | `学习` | Explain English-input expectation or use a deliberate manual path. | Medium | Not run |
| adversarial-mixed-language | `hello世界` | Reject/manual path; do not silently retain only one language. | Medium | Not run |
| adversarial-script | `<script>alert(1)</script>` | Reject or escape as text; no DOM execution. | Critical | Not run |
| adversarial-html | `<b>hip</b>` | Reject or escape as text; do not render active markup. | Critical | Not run |
| adversarial-javascript-url | `javascript:alert(1)` | Never create a clickable source; enforce an HTTPS allow policy. | Critical | Not run |
| adversarial-corrupt-json | `{"entries":[` import | Atomic rejection; preserve all existing data. | High | Not run |
| adversarial-double-save | Double-click save for `hip` | One local/remote mutation through idempotency or locking; loading ends. | High | Not run |
| adversarial-ai-race | Submit `hip`, then `bank` before first AI response | Latest request wins; late `hip` response cannot overwrite `bank` or later manual edits. | High | Not run |

## Evidence sources

The linguistic oracle was cross-checked in English against independent dictionary publishers:

- [Cambridge Dictionary — hip](https://dictionary.cambridge.org/dictionary/english/hip)
- [Cambridge English–Chinese — hip](https://dictionary.cambridge.org/dictionary/english-chinese-simplified/hip)
- [Oxford Learner's Dictionaries — hip noun](https://www.oxfordlearnersdictionaries.com/definition/english/hip_1)
- [Oxford Learner's Dictionaries — hip adjective](https://www.oxfordlearnersdictionaries.com/definition/english/hip_2)
- [Merriam-Webster — hip](https://www.merriam-webster.com/dictionary/hip)
- [Collins — hip](https://www.collinsdictionary.com/dictionary/english/hip)
- [Oxford — jab](https://www.oxfordlearnersdictionaries.com/definition/english/jab_1)
- [Merriam-Webster — take a jab at](https://www.merriam-webster.com/dictionary/take%20a%20jab%20at)
- [Cambridge Grammar — phrasal and multi-word verbs](https://dictionary.cambridge.org/grammar/british-grammar/phrasal-verbs)
- [Cambridge — record pronunciation](https://dictionary.cambridge.org/pronunciation/english/record)
- [Cambridge — issue pronunciation](https://dictionary.cambridge.org/pronunciation/english/issue)
- [Cambridge Dictionary — program](https://dictionary.cambridge.org/dictionary/english/program)
- [Cambridge Dictionary — spill the beans](https://dictionary.cambridge.org/dictionary/english/spill-the-beans)
- [Australian Government Style Manual — spelling](https://www.stylemanual.gov.au/grammar-punctuation-and-conventions/spelling)
- [U.S. National Archives — FDR First Inaugural Address](https://www.archives.gov/education/lessons/fdr-inaugural)
- [Washington Post — documented quotation misattributions](https://www.washingtonpost.com/history/2019/05/07/misquoting-einstein-jefferson-ghandi-congressional-pasttime/)

## Result-recording template

For each execution, append or link evidence using this shape:

| Field | Value |
|---|---|
| Case ID | |
| Environment and build/commit | |
| Browser/device | |
| Actual visible output | |
| Rubric scores (16 values) | |
| Total and hard-gate result | |
| Pass/Fail | |
| Severity if failed | |
| Console/network evidence | |
| Screenshot/artifact path | |
| Storage/API/GitHub comparison | |
| Defect and regression-test link | |
| Local retest | |
| Live retest | |
