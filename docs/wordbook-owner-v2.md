# 卓的公开词库与管理端 v2

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
       ├─ OpenAI Responses API: 主整理引擎，严格 JSON Schema + 英文 web search
       ├─ Claude Messages API: 可选备用引擎，同一 JSON Schema + 服务端语义校验
       └─ GitHub Contents API: 固定仓库/分支/路径 + blob SHA 乐观并发
```

安全边界：

- GitHub Pages 公开端没有写入按钮或写入凭据，只读取严格校验后的公开 JSON。
- Worker 的 OAuth callback 才能创建 `Secure; HttpOnly; SameSite=Lax; Path=/` 的 `__Host-zhuo_session`。
- 后端同时严格核对 GitHub `login`、数字 user ID、GitHub App installation、repository ID 和 Contents write permission。
- POST 写请求要求同源、JSON MIME、有效会话和 `X-CSRF-Token`；不开放 credentialed CORS。
- GitHub user access token在 Durable Object 中以 AES-GCM 加密；浏览器只得到短期 CSRF token，不得到 GitHub/OpenAI/Anthropic secret。
- 每个发布 mutation 必须带相同的 `mutationId` / `Idempotency-Key` 和远端 `baseSha`。远端变化返回 `409`，不会静默覆盖。
- Service Worker 对 `/api/*` 始终 network-only，不缓存认证或发布响应。

## 数据模型

- `vocab/data/owner-wordbook.json`：公开 canonical snapshot，`schemaVersion: 3`。
- IndexedDB `wordbook-db` v5：`entries`、`reviewStates`、`drafts`、`outbox`、`publicCache`、`quarantine`、`meta`。
- 草稿先本地保存，再加入持久 outbox；刷新、离线或关闭 PWA 后仍可恢复。
- 私人复习状态永远不写入公开 JSON。
- v1/v2 JSON 和 v4 IndexedDB 通过纯 migration 升级；无法安全迁移的记录进入 quarantine，不伪造或静默删除。
- 重复判断使用 canonical normalized term 和 correction alias；`jab at` 作为完整短语保存。

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
- 已在正式 Worker 完成真实 GitHub OAuth：页面显示 `@zhuodashuai`、固定 user ID `156042078`、已连接的目标仓库与 1 条公开词条；浏览器未收到 GitHub token。
- `vocab/js/runtime-config.js` 已指向上述 Worker origin，公开站的“所有者登录”会进入同源安全管理端。
- OpenAI 与 Claude 的 API key 尚未配置，因此 AI 自动整理当前明确显示为未配置并回退到手动草稿；这不影响卓本人登录、查看快照和手动编辑。没有真实 provider 结果前，不把 mock 结果写成线上通过。
- 尚未用生产 Worker 执行真实 GitHub 写入。第一次正式发布应选一个可保留的词条，人工复核后再发布，不用垃圾测试数据污染公开词库。

## 一次性生产配置（重建或迁移时使用）

不要把 secret 写入 `.env`、聊天、GitHub Actions 日志或仓库。下面的输入都在 GitHub/Cloudflare 官方页面或 `wrangler secret put` 的隐藏提示里完成。

1. 登录 Cloudflare Wrangler，并先在 `wordbook-api/` 中做一次无 secret 的初始部署，以取得唯一的 Worker HTTPS origin：

   ```powershell
   pnpm exec wrangler login
   pnpm exec wrangler deploy
   ```

   此时认证和 AI 会保持未配置、写入 fail closed；记录 Wrangler 返回的精确 `https://...workers.dev` 地址。
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
   pnpm exec wrangler secret put OPENAI_API_KEY
   ```

   `SESSION_SECRET` 必须是至少 32 个随机字节的 base64url 值；不要复用密码。默认 `AI_PROVIDER=openai`。如果需要 OpenAI 故障时自动切换到 Claude，再通过隐藏提示配置 `ANTHROPIC_API_KEY`，在 Worker variables 中填写当前稳定的 `ANTHROPIC_MODEL`，并保留 `AI_FALLBACK_PROVIDER=anthropic`。Claude 未配置时会被安全跳过，不影响 OpenAI 主流程。
4. 再运行一次 `pnpm exec wrangler deploy`；打开 `<Worker origin>/api/v1/health`，确认 owner auth 与所选 AI provider 均显示 configured。
5. 把这个公开 origin 写入 `vocab/js/runtime-config.js` 的 `OWNER_ADMIN_URL`，提交并让 GitHub Pages 发布。不要在这里写 client secret 或 token。
6. 在正式 Worker origin 打开 `/owner.html`，点击 GitHub 登录。必须实际显示 `@zhuodashuai` 与 user ID `156042078`，再用一个测试词条完成发布、刷新、编辑和删除。

## 运维与回滚

- GitHub JSON 是公开内容的权威源；管理端发现 SHA 冲突时应先刷新并逐字段处理，不能覆盖。
- AI 不可用时继续使用手动草稿；引用找不到权威出处时保存为 `unverified`，作者/作品/年份保持空白。
- OpenAI 与 Claude 都只能生成候选；无论由哪个 provider 返回，都必须通过同一份 Zod schema、分义项完整性、IPA 形态、双语例句和重复义项检查。Claude 的严格 JSON 输出与 web-search 引用当前不能放在同一次请求中，因此 Claude 备用结果不会自动把名言出处升级为已核验。
- PWA 新版本只在用户点击“立即更新”后切换并刷新，首次安装不会打断输入。
- 若 Worker 暂时不可用，GitHub Pages 公开词库仍可浏览；管理端 fail closed。
- 回滚前先导出管理端备份，并通过普通 Git commit/revert 操作处理；不要 force push 或改写历史。
