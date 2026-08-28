# 卓的公开词库

`/vocab/` 是一个可安装的只读公共词库 PWA。公开页面支持搜索、类型筛选、朗读、详情与 JSON 导出；公开 canonical data 位于 `data/owner-wordbook.json`（schema v3）。

## 权限边界

- 访客只能浏览公开快照，没有浏览器端写入入口。
- `?mode=personal` 不再代表身份，也不能解锁编辑功能。
- 所有者管理页由 `wordbook-api/` 的 Cloudflare Worker 同源托管。
- 只有 GitHub App OAuth 实际验证为 `zhuodashuai` 且 user ID 为 `156042078` 时，服务端才授予添加、编辑、删除、AI 整理和发布权限。
- GitHub token、OAuth client secret和任何可选的 OpenAI/Anthropic key只存在于服务端；前端不提供 PAT/API key 输入，也不把凭据写入 Web Storage、IndexedDB、Cache Storage 或 Service Worker。

## 数据与离线

- IndexedDB v6 分离草稿、发布队列、公开缓存、复习状态和隔离记录，并使部署前的旧管理标签页失效。
- 草稿先落本机，显式发布才产生 GitHub commit。
- 发布使用 Git blob SHA 与幂等 mutation ID；每次任务绑定收到卓点击的页面运行实例，Worker 同时强制 v38 客户端与队列协议。旧页面、旧队列或另一个标签页不能替本次页面提交；远端变化时进入冲突流程，绝不静默覆盖。
- 公开快照和私人复习状态严格分离。
- Service Worker 对 `/api/*` network-only；首次安装不会打断输入，新版本由用户点击后更新。

## AI 与出处

- 默认使用 Worker 自带的 Cloudflare Workers AI binding，无需 OpenAI/Claude API key。首轮由 `@cf/zai-org/glm-4.7-flash` 整理；若结果未通过服务端质量闸门，唯一一次重试会换成 `@cf/google/gemma-4-26b-a4b-it`。两者都属于当前 Workers Free 可用模型并共享账户 allocation；生产配置不设付费 fallback，且整个 Owner 账户每 UTC 日最多 20 次 AI 整理，额度不可用时只保留本地草稿。
- 上述应用上限控制本站请求，但不能感知同一 Cloudflare 账户中其他 Worker 的用量；Workers Paid 账户仍可能在免费 allocation 之外产生 Cloudflare 用量费用。严格零超额费用还需要账户保持 Workers Free 或使用账户侧预算控制。
- Cloudflare 路径先读取完整英文词条对应的本地 ECDICT 证据，再让模型做分义项、中文组织和例句补充。没有本地证据时会显示更强的人工复核警告。
- Cloudflare、OpenAI 和 Claude 共用同一份严格结构和语义质量校验；AI 输出只进入草稿，不能绕过卓的人工核对直接发布。OpenAI/Claude 只有在主动改配置时才会使用，并可能产生 API 费用。
- 拼写更正始终是建议；`recieve → receive` 必须由卓选择采用、保留或手动修改。
- `jab at` 作为完整短语处理，不拆成 `jab`。
- 名言与谚语只能标记 `verified`、`candidate`、`unverified` 或 `disputed`。Cloudflare 默认路径没有实时网页证据，因此作者、作品、年份和 URL 强制保持空白；只有实际取得可复查来源后才允许填写候选出处。

## 验证

从仓库根目录运行：

```powershell
pnpm test:security
pnpm test
pnpm --dir wordbook-api check
pnpm --dir wordbook-api exec wrangler deploy --dry-run
pnpm test:e2e
```

完整架构、迁移、安全设计和一次性生产配置见 `docs/wordbook-owner-v2.md`。`quality/` 保留 100 词公开质量数据与历史词典管线证据，但不参与所有者身份验证或发布。
