# 美西冬季旅行 2026

网页：<https://zhuodashuai.github.io/travel/west-2026/>

- [PLAN.md](PLAN.md)：方便队友阅读与在GitHub直接编辑的行程正文。
- [index.html](index.html)：互动地图、三种方案和逐日费用页面。
- [west-2026.pdf](west-2026.pdf)：2026/10/7价格快照，15页，方便转发。
- [plan.json](plan.json)：网页的结构化日程、酒店、团费、机票与价格依据。
- [map.json](map.json)：景点坐标、图片来源和地图几何。
- [app.js](app.js)、[style.css](style.css)：交互与样式。

## 怎么修改

只改攻略正文：打开 PLAN.md，点GitHub铅笔，保存提交。网页内容另由 plan.json 生成，因此正文和网页如都要改变，需要同步修改。

修改网页日期/费用：编辑 plan.json 中对应 options → itinerary → 日期 → items。金额 amountGroupUSD 都是两人合计；酒店是一间。保留 quote/published/estimate 状态和官网来源；新估算不能改成官网已核价。更改酒店或团总价时同步修改它的每日摊分，避免只改候选酒店表、漏改账单。当前A/B的五次单程、C四次单程均含随身箱，托运行李另计。

然后在本目录运行 `node build.mjs`，把生成的 data.js 一起提交；脚本会重新合计每天和各方案费用。日程与价格说明、官网日期URL需要按新的计划一起核查，不由脚本自动查价。

PDF和报价截图是已核快照，不随GitHub正文或JSON的手动修改自动更新。

## 当前预算快照

两成人，2026/12/8抵达SFO：A24天每人$8,703.67；B24天每人$9,043.82；C25天每人$8,781.92。餐饮/城市打车与两人700预留明确属于估算，黄石官方两席和最少4人成团需要人工确认。尚未预订或付款。

 D3 7.9.0使用其ISC许可，见 assets/D3-LICENSE.txt；保留发行文件头部。景点照片的来源与credit在地图详情中显示，报价截图为本次官网查询记录。
