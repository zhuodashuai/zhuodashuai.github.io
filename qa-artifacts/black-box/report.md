# Live black-box QA: `hip`

- Target: `https://zhuodashuai.github.io/vocab/`
- Date: 2026-08-28 (America/New_York)
- Method: visible UI only in a new browser tab; repository code and existing tests were not inspected.
- Clean-profile limitation: the browser origin already showed one local `jab at` entry. No browser data was inspected or cleared, so this run proves a first-visit navigation path but not a guaranteed empty-storage profile.

## Results

| Check | Result | Evidence |
|---|---|---|
| Live page loads | PASS | Title `卓同学的秘密单词屋`; public collection count 1; no console warning/error. `01-live-initial.png` |
| Enter `hip` in public search | PASS (read-only behavior) | Result text: `公开词库里暂时没有这个类型的词条。` No public add/edit/save control. `02-live-public-search-hip.png` |
| Visitor can add `hip` anywhere | PASS, local collection only | Switching to `我的本地词库` exposes `输入英文单词、短语或名言` and `自动整理`; UI explicitly says no login is required. `03-live-local-mode.png` |
| First-run ingest preference | PASS | Modal offers `可靠结果直接加入` (default) and `每次保存前让我确认`; setting saved successfully. |
| Organize exact input `hip` | PASS | Status: `已准确整理并加入 “hip”。继续输入下一条英文。` Count rose from 1 to 2. `05-live-hip-added.png` |
| Visible lexical result | PASS with metadata observation | Headword `hip`; `/hɪp/`; POS label `noun`; Chinese `n. 髋部；臀部 adj. 时髦的；消息灵通的`; English has two noun senses and one adjective sense; source badge `ECDICT 本地英汉词典`; tags `单词, noun, CET6, KY, EDITORIAL`. |
| Edit availability | PASS | `编辑词条` opens form; headword is read-only; type/POS/phonetic/tags/Chinese/English/example/translation/usage fields are present; save button is visible and enabled. `06-live-hip-edit-dialog.png` |
| Save availability | PASS | Saving the unchanged form closes the editor and shows `已保存在本地。继续输入下一条英文内容。` plus toast `已更新 “hip”`. `07-live-hip-saved.png` |
| Refresh persistence | PASS | After full reload, mode remains personal, direct-ingest setting remains, `hip` remains the active card and in the two-entry list. `08-live-hip-after-refresh.png` |
| Duplicate input | PASS | Second exact `hip` reports `“hip” 已经住在词库里：没有重复加入，也没有覆盖原释义。`; count stays 2. `09-live-hip-duplicate.png` |
| Console | PASS | No warnings or errors were reported at initial load, search, mode switch, add, edit, save, refresh, or duplicate check. |
| Failed network requests | BLOCKED (tooling visibility) | This browser surface did not expose a request log/resource timing API. No failed-resource console message or visible network failure occurred. |

## Findings

1. **Public vs local boundary — expected, informational.** A visitor cannot add `hip` to 卓同学的 public collection, but can add it to `我的本地词库` without login. Public mode is explicitly read-only.
2. **POS/sense consistency — FAIL, Medium (P2).** The card is labeled/tagged only `noun`, while both Chinese and English definitions also contain an adjective sense. The meaning itself is sensible, but the metadata does not fully describe the displayed senses.
3. **Examples are empty — observation, Low (P3).** Auto-organization supplies no example sentence, translation, or usage note for `hip`; edit fields are available for manual completion.

## Overall

**PASS with one P2 language-metadata issue and one tooling limitation.** Core visitor-local `hip` entry creation, editing, saving, reload persistence, and duplicate prevention all worked on the formal live site. Public collection mutation is unavailable to visitors by design.
