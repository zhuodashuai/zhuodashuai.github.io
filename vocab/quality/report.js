import { lookupParsedCoreEntry, parseCoreDictionary } from "../js/core-dictionary.js";

const refs = {
  status: document.querySelector("#overall-status"),
  total: document.querySelector("#total-count"),
  passRate: document.querySelector("#pass-rate"),
  passDetail: document.querySelector("#pass-detail"),
  duplicateResult: document.querySelector("#duplicate-result"),
  duplicateDetail: document.querySelector("#duplicate-detail"),
  networkRequests: document.querySelector("#network-requests"),
  networkDetail: document.querySelector("#network-detail"),
  generatedAt: document.querySelector("#generated-at"),
  datasetName: document.querySelector("#dataset-name"),
  categoryList: document.querySelector("#category-list"),
  notes: document.querySelector("#report-notes"),
  sampleList: document.querySelector("#sample-list"),
  error: document.querySelector("#load-error"),
  runCoreCheck: document.querySelector("#run-core-check"),
  runCoreResult: document.querySelector("#run-core-result")
};

let loadedDataset = null;

const STATUS_LABELS = {
  pending: "等待测试",
  running: "测试运行中",
  passed: "测试通过",
  failed: "存在失败",
  error: "报告不可用"
};

const CATEGORY_LABELS = {
  ordinary: "普通词",
  polysemy: "多义词",
  phrase: "短语",
  spelling: "拼写",
  special: "大小写与标点"
};

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 返回 ${response.status}`);
  return response.json();
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function renderStatus(status) {
  const safeStatus = Object.hasOwn(STATUS_LABELS, status) ? status : "error";
  refs.status.className = `status-pill ${safeStatus}`;
  refs.status.textContent = STATUS_LABELS[safeStatus];
}

function renderSummary(report, dataset) {
  const total = dataset.entries.length;
  refs.total.textContent = String(total);

  if (finiteNumber(report.summary?.passRate)) {
    refs.passRate.textContent = `${report.summary.passRate.toFixed(1)}%`;
  } else {
    refs.passRate.textContent = "—";
  }

  if (finiteNumber(report.summary?.passed) && finiteNumber(report.summary?.failed)) {
    refs.passDetail.textContent = `${report.summary.passed} 通过 · ${report.summary.failed} 失败`;
  } else {
    refs.passDetail.textContent = "尚未运行，不推定通过";
  }

  if (finiteNumber(report.duplicateRound?.finalUniqueCount)) {
    refs.duplicateResult.textContent = `${report.duplicateRound.finalUniqueCount}/${report.duplicateRound.inputCount || total}`;
  } else {
    refs.duplicateResult.textContent = "待运行";
  }
  refs.duplicateDetail.textContent = finiteNumber(report.duplicateRound?.providerRequests)
    ? `第二轮外部请求 ${report.duplicateRound.providerRequests} 次`
    : "等待100项重复输入实测";

  refs.networkRequests.textContent = finiteNumber(report.network?.requestCount)
    ? String(report.network.requestCount)
    : "—";
  refs.networkDetail.textContent = finiteNumber(report.network?.unexpectedRequestCount)
    ? `异常请求 ${report.network.unexpectedRequestCount} 次`
    : "等待浏览器测试记录";
}

function renderCategories(report, dataset) {
  refs.categoryList.replaceChildren();
  const reportByKey = new Map((report.categories || []).map((category) => [category.key, category]));

  for (const [key, expectedTotal] of Object.entries(dataset.expectedCategoryCounts)) {
    const actualTotal = dataset.entries.filter((entry) => entry.category === key).length;
    const result = reportByKey.get(key) || {};
    const card = document.createElement("article");
    card.className = "category-card";

    const topline = document.createElement("div");
    topline.className = "category-topline";
    const code = document.createElement("span");
    code.textContent = key.toUpperCase();
    const count = document.createElement("span");
    count.textContent = `${actualTotal}/${expectedTotal}`;
    topline.append(code, count);

    const heading = document.createElement("h3");
    heading.id = `category-${key}-title`;
    heading.textContent = result.label || CATEGORY_LABELS[key] || key;
    const total = document.createElement("strong");
    total.textContent = String(actualTotal);

    const track = document.createElement("progress");
    track.className = "progress-track";
    track.setAttribute("aria-labelledby", heading.id);
    const passed = finiteNumber(result.passed) ? result.passed : null;
    track.max = Math.max(1, actualTotal);
    track.value = passed === null ? 0 : Math.min(actualTotal, Math.max(0, passed));
    track.textContent = passed === null ? "等待实测结果" : `${passed}/${actualTotal}`;

    const status = document.createElement("p");
    status.className = "category-status";
    status.textContent = passed === null ? "等待实测结果" : `${passed} 项通过`;
    card.append(topline, heading, total, track, status);
    refs.categoryList.append(card);
  }
}

function renderAudit(report, dataset) {
  refs.generatedAt.textContent = report.generatedAt
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(report.generatedAt))
    : "尚未生成";
  refs.datasetName.textContent = dataset.name;

  refs.notes.replaceChildren();
  for (const note of report.notes || []) {
    const item = document.createElement("li");
    item.textContent = String(note);
    refs.notes.append(item);
  }

  refs.sampleList.replaceChildren();
  const samples = [0, 40, 60, 80, 90].map((index) => dataset.entries[index]?.input).filter(Boolean);
  for (const sample of samples) {
    const chip = document.createElement("span");
    chip.lang = "en";
    chip.textContent = sample;
    refs.sampleList.append(chip);
  }
}

async function init() {
  try {
    const [report, dataset] = await Promise.all([
      loadJson("generated-report.json"),
      loadJson("datasets/vocab-100.json")
    ]);
    if (!Array.isArray(dataset.entries) || dataset.entries.length !== 100) {
      throw new Error("100项公开测试数据不完整");
    }
    loadedDataset = dataset;
    renderStatus(report.status);
    renderSummary(report, dataset);
    renderCategories(report, dataset);
    renderAudit(report, dataset);
  } catch (error) {
    renderStatus("error");
    refs.error.hidden = false;
    refs.error.textContent = `质量报告暂时无法读取：${error.message || "未知错误"}`;
  }
}

init();

refs.runCoreCheck.addEventListener("click", async () => {
  if (!loadedDataset) return;
  refs.runCoreCheck.disabled = true;
  refs.runCoreResult.className = "running";
  refs.runCoreResult.textContent = "正在逐项核对100个词…";
  try {
    const core = parseCoreDictionary(await loadJson("../data/ecdict-core.json"));
    const failures = [];
    for (const item of loadedDataset.entries) {
      const entry = lookupParsedCoreEntry(core, item.canonicalTerm);
      if (!entry) {
        failures.push(`${item.input}：缺少本地词条`);
        continue;
      }
      const missing = item.requiredMeaningGroups.filter((alternatives) => (
        !alternatives.some((alternative) => entry.meaning.includes(alternative))
      ));
      const unsafe = loadedDataset.forbiddenText.some((value) => (
        entry.meaning.toLocaleLowerCase("en-US").includes(value.toLocaleLowerCase("en-US"))
      ));
      if (missing.length || unsafe) failures.push(`${item.input}：核心义项未通过`);
    }
    refs.runCoreResult.className = failures.length ? "failed" : "passed";
    refs.runCoreResult.textContent = failures.length
      ? `检测完成：${100 - failures.length}/100 通过。${failures.slice(0, 5).join("；")}${failures.length > 5 ? "；…" : ""}`
      : "检测完成：100/100 通过；未发现缺词、核心义项缺失或垃圾文本。";
  } catch (error) {
    refs.runCoreResult.className = "failed";
    refs.runCoreResult.textContent = `本地检测未能完成：${error.message || "未知错误"}`;
  } finally {
    refs.runCoreCheck.disabled = false;
  }
});
