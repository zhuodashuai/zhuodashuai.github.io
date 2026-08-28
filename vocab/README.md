# 卓同学的秘密单词屋

一个面向中文英语学习者的 local-first 单词、短语、名言整理工具。访客可以只读浏览卓同学的公开收藏，也可以在自己的浏览器里建立完全独立的私人词库。

## 查词与入库

- 首次使用只选择一次：`可靠结果直接加入` 或 `每次保存前让我确认`；以后可在右上角随时切换。
- 中文核心释义优先来自随站点发布的 7,500 条 ECDICT 子集；在线英文词典只补充词性、音标、英文释义和例句。
- 单词、短语和特殊写法使用统一规范键防重，但保留 `Beijing`、`iPhone`、`COVID-19`、`Ph.D.`、`C++` 等展示写法。
- `look after` 之类的短语按完整短语查询，不会退化成只查 `look`。
- 常见错拼先用人工审核规则纠正；有效英式拼写与技术词不会交给 LanguageTool 误改。
- 裸词和短语不采用 MyMemory 机器翻译。没有可靠中文来源时宁可留空并标记待完善。
- 重复输入会在补充查询前定位已有词条，不新增、不覆盖、不重复请求外部提供方。

## 数据边界与同步

- `data/owner-wordbook.json` 是随 GitHub Pages 发布的公开只读收藏。
- 私人词条、复习历史和设置默认只保存在当前浏览器 IndexedDB。
- 导入、导出使用完整 JSON 快照。
- GitHub 同步是可选备份：用户自行选择专用私有仓库；令牌只驻留当前 JavaScript 会话，不写入 IndexedDB、Cache Storage、源码或导出文件。
- 推送会检查远端 SHA，远端变化时停止而不是静默覆盖；拉取前必须确认，之后完整替换本机快照。
- 自动备份在最后一次本地修改 30 秒后运行，避免每个操作都创建提交。Git 历史会保留旧快照，因此不要在同步词条中写敏感信息。

## 安装

通过 HTTPS 在 Chrome 或 Edge 打开 `/vocab/`，点击“安装到桌面”。安装后的 PWA 会从桌面或开始菜单进入私人词库；首次完整加载后，界面、本地中英词典和公开收藏可离线使用。在线英文补充、出处候选与 GitHub 同步仍需要网络。

## 数据来源

- [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）：本地可信中英核心。
- [FreeDictionaryAPI](https://freedictionaryapi.com/) / Wiktionary：英文释义、IPA、词形、例句与分义项人工翻译。
- [LanguageTool](https://languagetool.org/)：仅在本地核心和英文词典都无法确认时提供拼写候选，候选还必须经过字典验证。
- [MyMemory](https://mymemory.translated.net/)：只可能成为较长上下文的未核验机器候选，不会成为裸词或短语的可信中文释义。
- [Wikiquote](https://en.wikiquote.org/)：名言出处候选，核对前始终标为未验证。

前端不保存任何第三方 API 密钥。不要把私人信息当作查词内容发送。

## 质量验证

```powershell
npm test
npm run test:live
```

确定性套件覆盖 100 项公开金标准、完整重复轮、20 路并发写入、短语整查、拼写边界和脏翻译拒绝。实网套件单独检查当前 FreeDictionary、MyMemory 与 LanguageTool 契约，避免外部服务临时故障污染确定性结果。

浏览器可在 `/vocab/quality/` 查看已发布证据，并独立重跑不读取私人词库的 100 词本地检测。
