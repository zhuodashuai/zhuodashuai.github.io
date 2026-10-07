# 美西2026旅行讨论页

本页2026/10/7完整更新；固定12/8抵达、12/31夜航返程，24天。只处理travel/west-2026，不改其它项目。

## 阅读入口

- [主行程与地图](https://zhuodashuai.github.io/travel/west-2026/)
- [预算计算](https://zhuodashuai.github.io/travel/west-2026/budget-check.html)
- [队友正文](PLAN.md)
- [预算审核](BUDGET.md)

主页面已整体替换旧A/B/C，不再只新增顶端通知。A6408.61为用户条件预算且有未核项目；B/C是本次官网样本加明示估算，不称全市场最低。旧PDF标为历史，不是最新版。

## 编辑与重建

`plan.json`是所有当前逐日项目、酒店候选和来源的可编辑数据；`map.json`是19个景点照片/坐标及边界。金额固定写两人合计，酒店一间。`status`必须区分quote、published、user、estimate，没价格不能冒称免费。

修改plan.json/map.json后运行：

```sh
node build.mjs
```

`data.js`由上述文件生成。`app.js`负责主页面，`budget-check.js`使用同一data.js作为样本，不重复叠加交通预算。每次数据更新同步PLAN.md、BUDGET.md并更新index.html的版本查询，避免缓存显示旧数。

所有数据为公开旅行研究，无个人资料、付款或订位。Source links是官网查询入口，不是已购买订单。新增原始证据保存在evidence/*.json；用户携程截图报价仅标用户提供。不要把公开起价、其它日期、两人价或押金当本日期每人最终总额。
