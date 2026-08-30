# 卓的单词本与管理端 v2

## 目标与边界

这个版本先把一个所有者流程做好：任何人可以只读浏览 `vocab/`，只有 GitHub 账号 `zhuodashuai`（固定用户 ID `156042078`）可以进入管理端、调用 AI、添加、编辑、删除并发布。访客个人词库是以后独立开发的功能，不与所有者权限混用。

学术主页、Education 学校标识、意见箱、留言簿、`U1L1_coding.ipynb` 和原有 GitHub Pages 结构不在此次改写范围。修改前的文件哈希保存在 `docs/wordbook-owner-v2-preservation.md`。

## 为什么旧版本会出问题

旧版把 `?mode=personal`、浏览器本地状态和可选的前端 GitHub token 当作“个人/所有者模式”。这些都不是身份验证；用户可以修改 URL 或浏览器状态，而且静态 GitHub Pages 不能安全持有 OAuth client secret、GitHub 写 token 或 AI key。旧数据管线还把短语拆成单词查询、偏选动词义项，并接受未经质量校验的公共机器翻译结果，导致 `jab at` 与 `hip` 等查询产生错义或脏中文。

## 最终架构

```text
公开访客
  └─ GitHub Pages /vocab/ ──只读──> vocab/data/owner-wordbook.json (schema v3)

卓本人
  └─ Cloudflare Worker 同源管理站
       ├─ Static Assets: 同一套 vocab 前端
       ├─ GitHub App OAuth: state + PKCE + 服务端 code exchange
       ├─ Durable Object: one-time state、加密 token、1 小时会话、CSRF、限流、幂等串行发布
       ├─ ECDICT asset: 完整词条的本地证据包
       ├─ Cloudflare Workers AI: 默认免费额度整理器，严格 JSON Schema + 服务端语义校验
       ├─ OpenAI / Claude: 仅在 Owner 主动启用时使用的可选付费引擎
       └─ GitHub Contents API: 固定仓库/分支/路径 + blob SHA 乐观并发
```

安全边界：

- GitHub Pages 公开端没有写入按钮或写入凭据，只读取严格校验后的公开 JSON。
- Worker 的 OAuth callback 才能创建 `Secure; HttpOnly; SameSite=Lax; Path=/` 的 `__Host-zhuo_session`。
- 后端同时严格核对 GitHub `login`、数字 user ID、GitHub App installation、repository ID 和 Contents write permission。
- POST 写请求要求同源、JSON MIME、有效会话和 `X-CSRF-Token`；不开放 credentialed CORS。
- GitHub user access token在 Durable Object 中以 AES-GCM 加密；浏览器只得到短期 CSRF token，不得到 GitHub secret 或任何可选的 OpenAI/Anthropic key。
- 每个发布 mutation 必须带相同的 `mutationId` / `Idempotency-Key` 和远端 `baseSha`。远端变化返回 `409`，不会静默覆盖。
- Service Worker 对 `/api/*` 始终 network-only，不缓存认证或发布响应。

## 数据模型

- `vocab/data/owner-wordbook.json`：公开 canonical snapshot，`schemaVersion: 3`。
- IndexedDB `wordbook-db` v6：`entries`、`reviewStates`、`drafts`、`outbox`、`publicCache`、`quarantine`、`meta`。
- 草稿先本地保存，再加入持久 outbox；刷新、离线或关闭 PWA 后仍可恢复。
- 私人复习状态永远不写入公开 JSON。
- GitHub 确认发布后，Worker 会把同一份已校验 snapshot 写入只读即时缓存；公开页优先读取 `/api/v1/public/wordbook`，不再等待 GitHub Pages 构建。该 GET 不需要登录，只返回本来就公开的 schema v3 数据，并只向固定 GitHub Pages origin 开放浏览器跨域读取；Worker 或即时缓存不可用时回退到 Pages JSON，再回退到已验证的 IndexedDB 缓存。
- 公开页在首次载入、重新聚焦、恢复可见、恢复联网以及前台每 30 秒自动检查；相同 `revisionId` 不重复写 IndexedDB 或重建 DOM，较旧 `exportedAt` 不能覆盖当前较新数据。
- v1/v2 JSON 和 v4 IndexedDB 通过纯 migration 升级；无法安全迁移的记录进入 quarantine，不伪造或静默删除。
- 重复判断使用 canonical normalized term 和 correction alias；`jab at` 作为完整短语保存。
- 多义词在管理列表、公开卡片与详情中统一显示为 `① ② ③`。卓可以在释义框输入普通的 `1.`、`1)` 或 `1、` 编号；展示层会自动规范为圆圈序号，单义词不编号，已有 `①②` 不重复编号。原始义项中明确存在的词性必须逐项保留，例如 `① noun: …`、`② adjective: …`，两个义项同为 `noun` 时也不能合并或删除；没有结构化义项证据时只显示顶层词性，不猜测其与各编号义项的对应关系。公开详情把每个义项分成独立区块，并将词性、中文释义、英文定义、每组双语例句、Usage、Register、词形与辨析信息分别成行；窄屏改为单列。该规则不改写 canonical JSON、草稿或导出文件中的原始 `meaning`。
- 顶层 `synonyms` 只属于当前词条，不加入 canonical/alias lookup key。AI 只能从卓已经亲自输入的草稿或公开词条中挑选同义词，未输入的候选确定性丢弃；发布时还要求每个同义词对应另一条真实公开词条。旧 schema v3 快照或本地草稿缺少该字段时安全补为 `[]`，未知字段仍按严格 schema 拒绝。

## 本地验证

在仓库根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm test:security
pnpm test
pnpm --dir wordbook-api check
pnpm --dir wordbook-api exec wrangler deploy --dry-run
pnpm test:e2e
```

E2E 测试服务器只提供确定性 mock OAuth/GitHub/AI 响应，不包含真实 token 或 API key。真实 provider 合同测试必须显式提供服务端测试环境，并且不属于普通 CI。

## 当前生产状态（2026-08-28）

- 管理端已部署到 <https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/owner.html>；健康检查为 `ok: true`。
- GitHub App `Zhuo Wordbook Owner` 已创建，并且只安装到 `zhuodashuai/zhuodashuai.github.io`；权限仅为 Metadata 只读与 Contents 读写。
- GitHub App client secret 和随机 session secret 已通过 Wrangler 隐藏输入保存为 Worker secret，没有写入浏览器、仓库或文档。
- 已在正式 Worker 完成真实 GitHub OAuth：页面显示 `@zhuodashuai`、固定 user ID `156042078`、已连接的目标仓库与当前 4 条公开词条；浏览器未收到 GitHub token。
- `vocab/js/runtime-config.js` 已指向上述 Worker origin，公开站的“所有者登录”会进入同源安全管理端。
- 默认 AI 已改为 Cloudflare Workers AI 的账户额度，无需 OpenAI 或 Claude API key。首轮固定使用 `@cf/zai-org/glm-4.7-flash`，未通过结构或语义闸门时改用 `@cf/google/gemma-4-26b-a4b-it`；若两者都失败，才以使用 `max_tokens` 适配后的 `@cf/openai/gpt-oss-120b` 作最后一次强推理兜底。三款都可消耗 Cloudflare 当前的 Workers Free allocation；生产配置没有付费 provider fallback，并由 Durable Object 对全部登录会话合计限制为每 UTC 日最多 20 次整理，额度或容量暂时不可用时只保留本地草稿。
- Cloudflare 当前文档给 Free 与 Paid 账户每天各 10,000 Neurons 的免费 allocation，并在 00:00 UTC 重置；Free 超额后请求失败，Paid 超过 allocation 后可能按量计费。本站 20 次上限不能感知同账户其他 Worker 的用量，所以严格零超额费用还要求账户保持 Workers Free 或设置账户侧预算控制。该政策可能变化，页面不承诺永久免费或无限次数。
- Cloudflare 路径先从随站点部署的 ECDICT 快照提取词汇证据，再由模型做结构化整理；没有本地词典证据的释义会明确降级为需要重点复核的候选。对于 AI 已判断为名言或谚语的输入，Worker 另行使用不需要 API key 的 Wikimedia 接口检索完整原文：Wikiquote、Wikidata 作品—作者关系和同作品 Wikisource 原文/扫描页即使三者一致，自动结果仍只标为 `candidate`；只有卓打开来源复查后才可人工升为 `verified`。模型记忆本身永远不能填入作者或作品，普通短语也不能因命中 Wikiquote 而被改成名言。
- 生产发布已通过真实 GitHub 写入验证；所有后续 AI 结果仍先保存在本地草稿，只有卓明确点击发布才写入公开词库。

## 一次性生产配置（重建或迁移时使用）

不要把 secret 写入 `.env`、聊天、GitHub Actions 日志或仓库。下面的输入都在 GitHub/Cloudflare 官方页面或 `wrangler secret put` 的隐藏提示里完成。

1. 登录 Cloudflare Wrangler，并先在 `wordbook-api/` 中做一次无 secret 的初始部署，以取得唯一的 Worker HTTPS origin：

   ```powershell
   pnpm exec wrangler login
   pnpm exec wrangler deploy
   ```

   此时 Owner 认证会保持未配置、写入 fail closed；Cloudflare Workers AI binding 不需要另录 API key。记录 Wrangler 返回的精确 `https://...workers.dev` 地址。
2. 在 GitHub 的 **Developer settings → GitHub Apps → New GitHub App** 创建一个 App。
   - Homepage URL：上一步取得的 Worker origin
   - Callback URL：同一 origin 加 `/api/v1/auth/callback`
   - Repository permissions：`Contents: Read and write`；Metadata 保持只读默认值
   - Installation：只安装到 `zhuodashuai/zhuodashuai.github.io`
   - 不需要 OAuth App 的 `repo` scope，也不要生成或粘贴 PAT
3. 回到 `wordbook-api/`，在 Wrangler 的隐藏输入提示中逐项安全录入：

   ```powershell
   pnpm exec wrangler secret put GITHUB_APP_CLIENT_ID
   pnpm exec wrangler secret put GITHUB_APP_CLIENT_SECRET
   pnpm exec wrangler secret put SESSION_SECRET
   ```

   `SESSION_SECRET` 必须是至少 32 个随机字节的 base64url 值；不要复用密码。默认 `AI_PROVIDER=cloudflare`，不需要第三方模型 key。只有 Owner 以后明确接受费用时，才可另行录入 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 并改变 provider 配置。付费 provider 作为 fallback 还必须显式设置 `ALLOW_PAID_AI_FALLBACK=true`；默认省略该变量，以防额度耗尽时静默计费。
4. 再运行一次 `pnpm exec wrangler deploy`；打开 `<Worker origin>/api/v1/health`，确认 owner auth 与所选 AI provider 均显示 configured。
5. 把这个公开 origin 写入 `vocab/js/runtime-config.js` 的 `OWNER_ADMIN_URL`，提交并让 GitHub Pages 发布。不要在这里写 client secret 或 token。
6. 在正式 Worker origin 打开 `/owner.html`，点击 GitHub 登录。必须实际显示 `@zhuodashuai` 与 user ID `156042078`，再用一个测试词条完成发布、刷新、编辑和删除。

## 日常部署

`vocab/` 是通过 Worker 的 ASSETS binding 提供的，**不是**只由 GitHub Pages 提供。
`https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/owner.html` 和该 origin 下的
整个应用，只有在 Worker 重新部署后才会变化；只合并到 `main` 只会更新
`zhuodashuai.github.io/vocab/` 这个公开页。

推送到 `main` 后，CI 的 `deploy` job 会在 `verify` 通过后自动执行
`wrangler deploy`。它需要仓库 secret：

- `CLOUDFLARE_API_TOKEN`（必需，权限：Workers Scripts\:Edit）
- `CLOUDFLARE_ACCOUNT_ID`（token 关联多个账户时才需要）

没有配置 token 时该 job 会跳过并留一条 notice，CI 仍是绿的；这时需要手动执行：

```bash
pnpm --dir wordbook-api exec wrangler deploy
```

`wrangler deploy` 不会动已经用 `wrangler secret put` 设过的 secret，只会重新发布
代码、`wrangler.jsonc` 里的 vars 和 `vocab/` 资源。部署后 job 会轮询
`/api/v1/health`，`ok` 不为 true 就判失败。

## 运维与回滚

- GitHub JSON 是公开内容的权威源；管理端发现 SHA 冲突时应先刷新并逐字段处理，不能覆盖。
- AI 不可用时继续使用手动草稿；引用找不到权威出处时保存为 `unverified`，作者/作品/年份保持空白。
- 所有 AI 生成的释义、例句与模型自报出处都只能视为候选；无论由哪个 provider 返回，都必须通过同一份 Zod schema、分义项完整性、IPA 形态、双语例句和重复义项检查。名言出处由独立证据链提供候选：只有完整输入逐词匹配时才采用 Wikimedia 结果，自动流程永不升级为 `verified`；免费检索失败时作者、作品和链接保持空白。
- 同义词是卓本人词库内部的词条关系，不是模型扩写列表。AI 只在 owner 输入白名单中判断 lexical entry 的同义关系，并排除自身、词形和易混词；空白名单必须返回空数组。多义词的顶层同义词仍需卓按具体义项人工核对。
- Workers Free 当前有每日账户免费额度；本站另有每 UTC 日 20 次整理硬上限。达到本站上限、Cloudflare 额度或容量限制后请求会失败。系统不显示伪造的“剩余额度”，也不把该政策宣传为永久无限免费；以 Cloudflare 实际账户和官方政策为准。
- 公开只读页发现 PWA 新版本后自动切换；Owner 管理端仍只在卓点击“立即更新”并完成两次草稿落盘后切换，首次安装不会打断输入。
- 若 Worker 暂时不可用，GitHub Pages 公开词库仍可浏览；管理端 fail closed。
- 回滚前先导出管理端备份，并通过普通 Git commit/revert 操作处理；不要 force push 或改写历史。
