# 卓的公开词库

`/vocab/` 是一个可安装的只读公共词库 PWA。公开页面支持搜索、类型筛选、朗读、详情与 JSON 导出；公开 canonical data 位于 `data/owner-wordbook.json`（schema v3）。

## 权限边界

- 访客只能浏览公开快照，没有浏览器端写入入口。
- `?mode=personal` 不再代表身份，也不能解锁编辑功能。
- 所有者管理页由 `wordbook-api/` 的 Cloudflare Worker 同源托管。
- 只有 GitHub App OAuth 实际验证为 `zhuodashuai` 且 user ID 为 `156042078` 时，服务端才授予添加、编辑、删除、AI 整理和发布权限。
- GitHub token、OAuth client secret、OpenAI/Anthropic key只存在于服务端；前端不提供 PAT 输入，也不把凭据写入 Web Storage、IndexedDB、Cache Storage 或 Service Worker。

## 数据与离线

- IndexedDB v5 分离草稿、发布队列、公开缓存、复习状态和隔离记录。
- 草稿先落本机，显式发布才产生 GitHub commit。
- 发布使用 Git blob SHA 与幂等 mutation ID；远端变化时进入冲突流程，绝不静默覆盖。
- 公开快照和私人复习状态严格分离。
- Service Worker 对 `/api/*` network-only；首次安装不会打断输入，新版本由用户点击后更新。

## AI 与出处

- 管理端只发送当前英文输入给选定的服务端 AI provider。
- 拼写更正始终是建议；`recieve → receive` 必须由卓选择采用、保留或手动修改。
- `jab at` 作为完整短语处理，不拆成 `jab`。
- 名言与谚语使用英文来源搜索；只能标记 `verified`、`candidate`、`unverified` 或 `disputed`。没有可复查来源时作者、作品、年份和 URL 保持空白。

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
