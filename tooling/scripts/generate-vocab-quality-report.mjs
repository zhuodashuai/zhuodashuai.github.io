import { readFile, writeFile } from "node:fs/promises";

const datasetUrl = new URL("../../vocab/quality/datasets/vocab-100.json", import.meta.url);
const reportUrl = new URL("../../vocab/quality/generated-report.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));

const labels = {
  ordinary: "普通词",
  polysemy: "多义词",
  phrase: "短语",
  spelling: "拼写",
  special: "大小写与标点"
};

const categories = Object.entries(dataset.expectedCategoryCounts).map(([key, total]) => ({
  key,
  label: labels[key] || key,
  total,
  passed: null,
  status: "pending"
}));

const report = {
  schemaVersion: 1,
  status: "pending",
  generatedAt: new Date().toISOString(),
  dataset: {
    name: dataset.name,
    path: "datasets/vocab-100.json",
    total: dataset.entries.length
  },
  summary: {
    total: dataset.entries.length,
    passed: null,
    failed: null,
    passRate: null
  },
  duplicateRound: {
    status: "pending",
    inputCount: dataset.entries.length,
    finalUniqueCount: null,
    providerRequests: null
  },
  network: {
    status: "pending",
    requestCount: null,
    unexpectedRequestCount: null
  },
  categories,
  notes: [
    "这是尚未执行查词管线和浏览器重复轮的初始报告。",
    "pending 不代表通过或失败；未来测试运行后才会写入结果。",
    "报告只使用公开测试词，不读取所有者草稿、GitHub 令牌或同步配置。"
  ]
};

await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Initialized pending vocabulary quality report for ${dataset.entries.length} public cases.`);
