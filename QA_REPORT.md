# 卓的英语词库 — 独立 QA、语言质量与回归报告

测试日期：2026-08-28（America/New_York）  
正式站点：<https://zhuodashuai.github.io/vocab/>  
仓库：<https://github.com/zhuodashuai/zhuodashuai.github.io>  
本地分支：`codex/wordbook-owner-v2`  
测试前基线：`859b41106e125af620615d6e320298d8fad24313`

## 结论

本地候选版本的自动化、确定性浏览器和安全边界测试全部通过；但**正式环境仍不具备新版 Owner 登录、AI 整理和 GitHub 写入链路**。正式 GitHub Pages 当前仍是旧版 v13/PAT 管理界面，`/vocab/owner.html` 与 `/api/v1/session` 返回 404。Cloudflare Worker、GitHub App、服务端 secret 和 `OWNER_ADMIN_URL` 尚未配置，因此真实 `zhuodashuai` 身份、真实 AI 输出、真实 GitHub commit、正式环境数据生命周期都为 **BLOCKED**，不是 Passed。

退出条件因此尚未全部满足。本报告没有把 mock OAuth、fixture 或本地 dry-run 冒充成正式环境成功。

## 首次线上黑盒：`hip`

黑盒测试在查看当前实现之前完成。逐步截图和原始记录位于 [`qa-artifacts/black-box/`](qa-artifacts/black-box/)。为避免删除已有浏览器数据，又使用尾点主机名 `https://zhuodashuai.github.io./vocab/` 取得独立 origin，确认空本地词库下的首次添加路径。

### 当前线上实际结果

- 未被判断为拼写错误，也没有被替换。
- IPA 为 `/hɪp/`。
- 中文包含 `n. 髋部；臀部` 和 `adj. 时髦的；消息灵通的`。
- 英文包含两个身体/关节 noun 意义和一个 fashionable adjective 意义。
- 卡片和标签的词性却只有 `noun`；noun 与 adjective 没有作为独立 sense 组织。
- 英文例句、例句翻译和 usage 为空。
- 可以编辑、保存，刷新后仍存在；再次输入同一 `hip` 不会重复添加。
- 当前操作的是访客自己的 IndexedDB 本地词库，没有写入卓的公开 GitHub 词库。
- 整个流程未观察到 console warning/error；当前浏览器工具未提供完整 network waterfall，因此 failed-request 明细为 BLOCKED。

### 权威预期

预期通过 [Cambridge](https://dictionary.cambridge.org/dictionary/english/hip)、[Oxford noun](https://www.oxfordlearnersdictionaries.com/definition/english/hip_1)、[Oxford adjective](https://www.oxfordlearnersdictionaries.com/definition/english/hip_2)、[Merriam-Webster](https://www.merriam-webster.com/dictionary/hip) 和 [Collins](https://www.collinsdictionary.com/dictionary/english/hip) 交叉核验：

1. `/hɪp/`；不能当作拼写错误。
2. 常用 noun 首位：身体腰部以下、腿部以上的髋部/臀部两侧，或腿与骨盆相接的髋关节区域。
3. 独立 informal adjective：时髦的、了解最新潮流的。
4. `rose hip` 的植物果实义可以低优先级收录，不能压过常见义。
5. 每个 POS/sense 都有自己的英文解释和对应双语例句。

当前线上结果在拼写、IPA 和核心释义上基本正确，但在多词性结构与例句完整性上失败。

## `hip` 过去为什么会出现 `verb + kamus在线bm ke bi`

用户提供的旧版截图对应旧的三段式数据管线：

1. 旧字典选择器显式优先找 `verb`，所以多词性词会越过常用 noun，选到罕见动词义。
2. 旧 MyMemory 翻译结果没有验证 HTTP body 状态、匹配分、中文字符或垃圾/配额提示，公共翻译记忆库的污染文本被直接写进中文释义。
3. 旧扁平模型只有一个 `partOfSpeech`，却把不同词性的多条释义拼在同一字段，无法保持 POS、定义和例句的一一对应。
4. 原测试主要验证字段存在、HTTP 成功和 JSON 可解析，没有把 noun-first、独立 adjective sense、`/hɪp/` 与双语例句作为永久语义断言。

当前正式站点已经通过本地 ECDICT/editorial 层避免了最严重的 verb/脏翻译结果，但仍保留扁平 POS 问题。新版候选改用服务端 AI + 严格结构 + 通用语义闸门；旧数据管线不再是新版 Owner 流程的发布依据。

## 修复摘要

- 新增通用 AI 语义闸门：词汇型输入必须至少有一个完整 sense；每个 sense 必须有 POS、中文、英文定义和双语例句；重复 sense、重复例句、非 IPA 格式会触发一次重试，连续失败则保留手动草稿并明确报错。
- 从 sense 确定性重建顶层 POS、中文、英文和首条例句，防止 `verb` 顶层字段与 noun/adjective senses 自相矛盾。
- 所有单词和短语均允许英文 web search，并要求模型优先交叉核对 Cambridge、Oxford、Merriam-Webster、Collins 等权威英英词典；引用只有真正出现在 response citation 时才能保存。
- 有效英式/澳式拼写不会被美式拼写静默替换；词形的 surface form 与 lemma 分离。
- 拼写建议继续保留原始输入，必须由 Owner 明确采用/保留/手改；服务端拒绝仍处于 `suggested` 的直接发布请求。
- 删除硬编码 `0.9` 伪置信度，改为明确标记来源的 edit-distance heuristic，并继续要求人工决定。
- `hip`、`Hip`、`HIP`、`hip!`、`"hip"` 共用去重键，同时保留 `originalInput`；句子和真正引语的标点不会被剥离。
- 输入在调用 AI 前拒绝纯中文、混合中英文、HTML 标签、`javascript:`、控制字符、纯数字/emoji 和超过 2,000 字符的内容；1 个字母仍允许。
- 修正 501–2,000 字符通过输入验证、却被 500 字符 term/correction schema 拒绝的内部长度矛盾。
- 修正 stale-SHA 自动 rebase 继续复用旧 mutation ID 导致 idempotency hash 冲突的问题。
- 修正 idempotent replay 可能把已被远端更新的本地草稿错误标成 Published 的问题。
- 增加“GitHub 已 commit 但浏览器在收到 response 前刷新”的只读启动对账；只有 mutation ID 和语义内容都匹配才完成任务，不会自动重发写入。
- 被 Owner 拒绝的拼写建议不再占用该建议词的去重 alias。
- Service Worker 对 JS/CSS/manifest 改为联网重新验证，`/api/*` 永不缓存，并在 activate 清理旧词库 cache。

以上运行时修复均为通用规则；`hip` 的具体答案只存在于测试 oracle/mock 中，不在生产代码中硬编码。

## 问题清单

| ID | Input | Expected | Actual | Severity | Root cause | Fix | Regression test | Local result | Live result |
| -- | ----- | -------- | ------ | -------- | ---------- | --- | --------------- | ------------ | ----------- |
| QA-001 | `hip` | noun 与 informal adjective 分开；每义项有双语例句 | 正式站点只有 `noun` 标签，定义混入 adjective；例句为空 | High | 旧扁平词条模型只容纳一个 POS | 通用 sense schema、语义闸门、由 senses 重建顶层字段 | API `hip` semantic regression；Playwright 完整发布/详情 | PASS | **FAIL / 未部署** |
| QA-002 | `hip`（用户旧截图） | 常用 noun 首位、干净中文 | 旧结果选罕见 verb，并出现 `kamus在线bm ke bi` | High | verb-first 选择器 + 未过滤公共 MT 结果 | 旧层已用 noun-first editorial/垃圾过滤；新版不再采用该 MT 管线 | `core-accuracy`、dirty-translation、API dirty-top-level fixture | PASS | Gross error 不再复现；结构问题仍 FAIL |
| QA-003 | Owner 登录 | GitHub OAuth；浏览器不接触 token | 正式站点要求 fine-grained PAT；新版 `/owner.html`/API 404 | Critical | 新 Worker/GitHub App 没有部署，Pages 仍是 v13 | 本地已实现 HttpOnly session、账户+数值 ID+repo ID 校验、CSRF、Origin 与 idempotency | auth/security/API/E2E | PASS（mock + integration） | **BLOCKED** |
| QA-004 | `hip!`, `"hip"`, case variants | 去重为 `hip`，保留用户原文 | 修复前会分类为 quote 或产生不同 key | High | normalization 只处理大小写/空格 | 单词边界标点 canonicalization，同步到浏览器与 Worker | schema + browser normalization + Playwright `HIP!` | PASS | BLOCKED（未部署） |
| QA-005 | `<script>…`, HTML, `javascript:`、混合中英文 | AI 前安全拒绝 | 修复前含英文字母即可进入 AI 流程 | High | 输入验证只检查是否含 `[A-Za-z]` | HTML/JS/CJK/control/length guards；DOM 始终使用 textContent | schema、resilience、XSS Playwright | PASS | BLOCKED（Owner API 未部署） |
| QA-006 | AI duplicate sense / empty examples / invalid IPA format | 不创建半个词条；重试后可手填 | 旧 shape-only Zod 可接受 | High | 只验证 JSON 类型，不验证语义一致性 | `semantic-quality.ts` 通用闸门与 retry | failure-simulations + complete `hip` | PASS | BLOCKED（无真实 AI） |
| QA-007 | `colour`, `organise`, `learnt`, `travelling`, `enrolment`, `judgement`, `programme` | 合法英/澳式，不自动改成美式 | 旧 US-oriented 拼写器可能误改 | High | 区域变体未受保护 | 区域词形保护 + prompt 明示 | 71-case semantic fixture + API | PASS（规则/fixture） | BLOCKED（无真实 AI） |
| QA-008 | `recieve` 等 | 建议并等待明确决定；合理置信依据 | 旧代码使用固定 `.9` 且 direct API 可发布 unresolved suggestion | High | 伪置信度；发布 schema 未封锁 | edit-distance heuristic 来源标签；PublishRequest 拒绝 `suggested` | API schema + correction E2E | PASS | BLOCKED（未部署） |
| QA-009 | GitHub SHA conflict | rebase 后安全重试一次，不覆盖远端 | rebase 改了语义 payload 却复用已绑定旧 hash 的 mutation ID | High | idempotency key 未随语义 payload 旋转 | 语义 rebase 生成新 mutation ID | v3 sync regression | PASS | BLOCKED（无真实 GitHub write） |
| QA-010 | response-lost refresh / idempotent replay | 不重复发布，也不把不匹配草稿标为已发布 | 旧恢复路径可能冲突或出现假 Published | High | 启动恢复缺少远端语义对账 | mutation ID + remote semantic equality 双条件只读对账 | owner-storage recovery tests | PASS | BLOCKED（无真实 GitHub write） |
| QA-011 | kept `desert` after rejecting `dessert` | 后续可建立合法 `dessert` | backend 仍把 rejected suggestion 当 alias | Medium | browser/server alias 规则不一致 | kept 仅保留 original+chosen alias | schema/sync tests | PASS | BLOCKED（未部署） |
| QA-012 | 501–2,000 字符英文 | 统一接受或明确拒绝，不在后段崩溃 | input 允许 2,000，term/correction 只允许 500 | Medium | schema 长度不一致 | 相关字段统一 2,000；2,001 明确拒绝 | schema boundary test | PASS | BLOCKED（未部署） |
| QA-013 | AI/API/GitHub failure | 草稿保留、loading 结束、可重试/手填 | 原覆盖不完整 | Medium | 缺少故障注入矩阵 | 401/429/500/timeout/non-JSON/wrong-type/GitHub timeout/corrupt JSON tests | failure/resilience/E2E | PASS | BLOCKED（真实 provider 未配置） |
| QA-014 | SW 旧资源 | 明确更新、草稿 flush 后才激活、旧 cache 清除 | cache-first 可能长期保留旧 JS/CSS/manifest | Medium | mutable asset 缓存策略过强 | network-first revalidation + explicit update + old-cache cleanup | PWA runtime + E2E | PASS | BLOCKED（未部署） |
| QA-015 | live security headers | CSP、frame、referrer 等由响应头强制 | GitHub Pages 当前只有页面 meta CSP，不能提供完整自定义 header | Medium | GitHub Pages header 能力有限 | Worker asset response 已有 CSP/X-Frame-Options；Pages meta 继续兜底 | dry-run + source scan | PASS（Worker local） | **OPEN until Worker serves admin** |
| QA-016 | 格式合法但语义错误的 `/hɑp/`；自然但放错 sense 的例句 | 自动识别所有语义错误 | 确定性闸门无法通用证明语音/例句语义 | High residual | 语义真值不能由 schema/regex 完全证明 | 已加权威 web cross-check、gold fixtures、Owner 发布前复核；仍需真实 provider eval | known-error fixtures 可捕获已知案例 | PARTIAL | **BLOCKED** |

## 语言测试矩阵

机器可读金标准位于 [`vocab/quality/datasets/semantic-qa.json`](vocab/quality/datasets/semantic-qa.json)，人工执行版位于 [`TEST_CASES.md`](TEST_CASES.md)：

- 多义词 12
- 短语/phrasal verbs 8
- 拼写错误 6
- 英式/澳式拼写 7
- 词形变化 7
- Idioms 5
- 名言与出处 4
- 输入标准化 8
- 边界/恶意输入 14
- 合计 71

16 维评分为每项 0/1/2，阈值 28/32；错误核心义、虚构来源、静默误纠正、例句错配或任何关键维度为 0 会直接 Fail。

这 71 项的**预期、严重程度与禁止行为**已全部建立并通过 fixture 一致性测试；它们不是 71 次真实线上 AI 输出。由于正式 Owner AI 未部署，当前只有 `hip` 完成线上黑盒实际值采集，其余 live AI actual 均为 BLOCKED。

另有旧本地词典的 100 词金标准和 100 次重复输入测试通过；该结果验证旧 offline pipeline 与去重逻辑，不替代新版真实 provider 的 71 项 live semantic evaluation。

## 故障、权限、生命周期与浏览器覆盖

### 外部故障

已确定性模拟 AI timeout、401、429、500、两次 non-JSON、缺字段、错类型、重复 sense、错误 IPA 格式、缺双语例句、字典/拼写/翻译/出处 provider 不可用、GitHub timeout/500/损坏远端 JSON/SHA conflict、突然离线、response-lost refresh 与旧 Service Worker cache。所有本地测试都证明草稿或队列保留，loading 会结束，用户可重试或手填，不会静默覆盖远端。

### 身份与权限

- 未登录访客、错误账号、离线未认证、直接 API 写入、错误 Origin/CSRF/idempotency、过期会话均 fail closed。
- 本地 E2E 的 `zhuodashuai` 是确定性 mock，只证明 UI 和协议行为。
- 浏览器 asset 未发现 token/API key/secret 字面值、credential 输入框或 credential 持久化路径。
- 真实 GitHub App identity、数值 owner ID `156042078` 和 repository ID 的线上验证为 BLOCKED。

### 数据生命周期

本地 E2E 已覆盖：输入 → AI 候选 → 人工修改 → IndexedDB 草稿 → mock 发布 → 刷新 → 离线查看/排队 → 联网同步 → 编辑 → 再发布 → 导出 → 删除 → 导入。并覆盖多标签页、刷新恢复、并发冲突和重复提交。

真实 GitHub JSON、真实 API response、正式公开页面之间的一致性尚未执行，因为没有生产 Worker/GitHub App 授权；不得视为通过。

### 浏览器

- 正式站点：Codex in-app Chromium 可见操作与截图，无 console error；完整 network waterfall 不可用。
- 本地：Chrome/Chromium desktop、375×812 mobile、键盘 focus/touch target、快速双提交、back/forward、多标签页、offline/online、Slow 3G、PWA manifest `display: standalone`、Service Worker install/update/activate 均有自动覆盖。
- 当前自动化验证 standalone manifest/installability 和 standalone-safe layout，未在真实操作系统桌面图标中启动一次安装后的独立窗口；正式 PWA 安装 smoke test 为部署后的人工步骤。

## 测试结果

最终计数应以提交前最后一轮命令输出为准：

| Suite | Result |
|---|---:|
| Frontend/data Node unit | 98 passed |
| Worker/API Vitest | 60 passed |
| Playwright browser E2E | 21 passed |
| Total automated assertions/tests | **179 passed, 0 failed** |
| TypeScript `tsc --noEmit` | PASS |
| Secret boundary scan | PASS |
| Cloudflare Worker `wrangler deploy --dry-run` | PASS |

## 生产阻塞与下一步

当前机器没有 `gh` CLI/可用 Git push credential，Wrangler 明确返回 `You are not authenticated`。生产 Worker 还需要由 Owner 在隐藏 secret prompt 中配置 GitHub App client ID/client secret、随机 session secret 和 OpenAI API key，再把准确的 Worker origin 写入 `vocab/js/runtime-config.js`。

完成这些授权前：

- 不能推送并发布这次 QA 修复；
- 不能真实登录为 `zhuodashuai`；
- 不能运行 71 项正式 AI 语义矩阵；
- 不能核对最终 GitHub JSON、API response 与正式页面；
- 不能关闭 QA-003、QA-016 或宣布“不存在 Critical/High 问题”。

所需生产配置和不泄露 secret 的步骤见 [`docs/wordbook-owner-v2.md`](docs/wordbook-owner-v2.md)。

