# 卓的英语词库 — QA、语言质量与生产验证报告

测试日期：2026-08-28（America/New_York）

正式公开站：<https://zhuodashuai.github.io/vocab/>

正式管理站：<https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/owner.html>

仓库：<https://github.com/zhuodashuai/zhuodashuai.github.io>

测试分支：`codex/wordbook-owner-v2`

测试前基线：`bce796a1992deaabbf7f31402a058edcd83cbc21`

## 结论

Owner-only 词库、GitHub OAuth、可恢复草稿、重复词识别、严格 AI 质量闸门和免费优先 AI 路径已经接通。最终全量自动化为：Frontend/data 102、Worker/API 86、Playwright 23，共 **211 passed, 0 failed**；TypeScript、Wrangler 配置类型检查、secret boundary scan 和 Wrangler dry-run 也全部通过。

生产 Worker 健康检查为 `2.2.0`，主模型是 `@cf/zai-org/glm-4.7-flash`，质量重试模型是 `@cf/google/gemma-4-26b-a4b-it`。两者都通过同一个 Cloudflare Workers AI binding 调用，不需要 OpenAI/Claude API key。`paidFallbackEnabled` 在生产环境明确为 `false`，所以额度或服务不可用时请求会失败并保留本地草稿，不会静默调用 OpenAI/Claude。服务端另设所有会话共享的每 UTC 日 20 次整理上限，错误输入在计数前即被拒绝。

正式 OAuth 已真实验证为 GitHub `@zhuodashuai`、user ID `156042078` 和固定目标仓库。当前 GitHub 公开 canonical snapshot 仍只有 1 条原有的 `jab at`；本轮生产 AI 测试建立的 `hip`、`bank` 都只保存在当前浏览器的 IndexedDB 草稿中，没有发布或污染公开词库。

本报告不承诺“绝对没有 bug”。它只陈述已经自动覆盖和真实实测的行为，并明确列出仍需人工判断或受第三方政策影响的边界。

## 免费 AI 方案

- 第一轮：Cloudflare `@cf/zai-org/glm-4.7-flash`。
- 第一轮输出只要缺义项、混合不相关义项、缺双语例句、IPA 不合格、拼写与本地证据冲突或结构不完整，就不能进入草稿。
- 唯一一次质量重试：自动换为 `@cf/google/gemma-4-26b-a4b-it`，并把安全、白名单化的失败原因交给第二模型修正。
- 第二轮仍不合格：返回明确错误，保留旧草稿，允许手动填写或稍后重试。
- OpenAI 与 Claude 只保留为以后可选的显式配置；除非 Owner 同时配置 provider 和 `ALLOW_PAID_AI_FALLBACK=true`，否则不会调用。
- Durable Object 为整个 Owner 账户设定每 UTC 日 20 次 AI 整理的硬上限，而不是每个浏览器各 20 次；达到上限后只允许手动草稿。

Cloudflare 当前文档说明，Workers Free 与 Paid 都有每日 10,000 Neurons 的免费 allocation，00:00 UTC 重置；Free 超额后继续请求会失败，而 Workers Paid 超过 allocation 后可能按量计费。应用内 20 次上限能限制本站自身的请求次数，但无法读取或约束同一 Cloudflare 账户中其他 Worker 的用量。因此要严格做到零超额费用，Cloudflare 账户还必须保持 Workers Free，或由账户侧的预算控制兜底。该额度、模型范围和政策属于第三方可变条件，产品不承诺“永久免费”或“无限次数”。

## 生产语义实测

### `hip`

真实登录后的生产管理站测试结果：

- 保留输入 `hip`，未误判拼写；
- IPA 为 `/hɪp/`；
- noun 与 informal adjective 为独立 sense；
- 常用身体/髋关节义优先，另有“时髦的”义；
- 每个 sense 有对应英文定义与双语例句；
- 完整草稿再次输入 `hip` 时直接识别为已有记录，不重复创建，也不再消耗 AI 请求；
- 旧的半成品草稿则会被同一条记录补全，而不是新增重复项。

### `bank`

`bank` 用来验证多义词和免费模型切换。生产日志显示第一模型漏掉必需动词义，服务端质量闸门正确拒绝；第二模型随后通过。最终草稿包含：

1. noun：银行／银行机构；
2. noun：河岸／堤岸；
3. verb：存钱／把钱存入银行；
4. verb（通常 `bank on`）：依靠／指望。

四个 sense 分离、各有自己的双语例句，IPA 锁定为 `/bæŋk/`。这证明模型切换不是盲目重试：第一轮错误没有进入草稿，第二轮也必须满足同一质量标准才能写入。

## 关键回归覆盖

| 范围 | 已验证行为 |
|---|---|
| Owner 权限 | 只有服务端验证后的 `zhuodashuai` 固定数字 ID 可编辑；访客即使修改 URL 或 DOM 也不能获得写权限 |
| GitHub 安全 | HttpOnly session、CSRF、Origin、repository ID、Git blob SHA、幂等 mutation ID 与冲突处理 |
| 草稿可靠性 | IndexedDB v5、刷新/离线恢复、多标签页、失败重试、response-lost 对账、备份导入导出 |
| 重复词 | 100 个输入首轮只写入一次；完整重复轮保持 100 条且产生 0 次 provider 请求；大小写和普通边界标点共用 canonical key |
| AI 质量 | JSON/Zod、中文字符质量、英文定义、独立 sense、独立例句、IPA、拼写/lemma、本地 ECDICT 与 curated gold grounding |
| 拼写 | `recieve → receive` 仅作为建议；英式/澳式合法拼写不被静默改为美式 |
| 短语 | `jab at`、phrasal verb、idiom 按完整表达处理，不截成第一个单词 |
| 引语出处 | 免费模型没有实时网页检索时，作者、作品、年份和 URL 保持未核验及空白，不凭模型记忆编造 |
| PWA | desktop/mobile、standalone manifest、Service Worker network-first 更新、API network-only、旧 cache 清理 |
| 故障 | AI 401/429/5xx/timeout/非 JSON/错误 schema、GitHub timeout/损坏 JSON/SHA conflict 均 fail closed |

## 最终自动化结果

| Suite | Result |
|---|---:|
| Frontend/data Node unit | 102 passed |
| Worker/API Vitest | 86 passed |
| Playwright browser E2E | 23 passed |
| Total | **211 passed, 0 failed** |
| TypeScript `tsc --noEmit` | PASS |
| Wrangler `types --include-runtime=false --check` | PASS |
| Secret boundary scan | PASS（118 repository files） |
| Cloudflare Worker `wrangler deploy --dry-run` | PASS |

公开的 71-case semantic matrix 和 100-word gold dataset 用于固定拼写、多义词、短语、英澳拼写、词形、idiom、引语与恶意输入的预期。100-word 本地管线和完整重复轮已真实自动运行；71-case matrix 是质量 oracle 与固定回归集，不冒充 71 次生产模型调用，以免浪费免费额度。

## 已知边界

- 免费 AI 不是离线模型，也不是永久无限资源；Cloudflare 改政策、模型下线、容量不足、本站 20 次日上限或账户当日额度用完时，自动整理会暂时不可用，但手动草稿和公开词库仍可用。
- Cloudflare 默认路径没有实时网页检索。普通词汇由本地 ECDICT、curated semantic QA 和 100-word gold 数据约束；名言名句的可靠出处仍需要有网页检索能力的后续模块或人工核验。
- AI 结果始终是候选，不能绕过卓的人工复核直接发布。
- 本轮没有对 GitHub 执行测试词的 add/edit/delete 生产写入；这是为了保留公开词库现有内容。同步协议的完整生命周期由 API integration 与 Playwright mock GitHub 测试覆盖。
- 当前浏览器中有 `hip` 和 `bank` 两份未发布测试草稿。它们可继续人工核对或由卓自行删除；本轮没有代替 Owner 做破坏性删除。

## 复现命令

```powershell
pnpm test:unit
pnpm --dir wordbook-api test
pnpm --dir wordbook-api check
pnpm --dir wordbook-api exec wrangler types --include-runtime=false --check
pnpm test:security
pnpm --dir wordbook-api exec wrangler deploy --dry-run
pnpm test:e2e
```

部署、安全与运维说明见 [`docs/wordbook-owner-v2.md`](docs/wordbook-owner-v2.md)。
