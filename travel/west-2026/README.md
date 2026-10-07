# 美西2026旅行规划

2026/10/7同日期比较版v5。主页面和 prices.html 共用 plan.json/data.js；支持酒店和机票换选、海岸交通选择，再点击计算。budget-check.html 转到最新比价页，旧书签不再停留高价旧方案。

- [价格从低到高比较](https://zhuodashuai.github.io/travel/west-2026/prices.html?v=price-compare-5)
- [完整行程地图与逐日账单](https://zhuodashuai.github.io/travel/west-2026/?v=price-compare-5)
- [队友可读行程](PLAN.md)
- [报价清单](PRICE-COMPARISON.md)

plan.json保存逐日项目、完整日期、来源和比较数据，金额恒为两人，酒店为一间；map.json保存坐标和照片。改数据后执行 node build.mjs 生成data.js。quote为日期实选显示报价，published为官方费率计算，estimate为占位，user为用户提供或目标，list不是最终报价。未知不写为免费。比较计算不会自动改写固定B/C逐日路线。

不覆盖其他travel项目。历史PDF和更早截图仅供回看，不是当前报价。未预订、锁位或付款。
