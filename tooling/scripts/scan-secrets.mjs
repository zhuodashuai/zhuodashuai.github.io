import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8"
}).split("\0").filter(Boolean);

const excluded = /^(?:node_modules|\.git|\.wrangler|test-results|playwright-report)\//;
const textFiles = candidates.filter((file) => !excluded.test(file.replaceAll("\\", "/")));
const findings = [];

const credentialPatterns = [
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,255}\b/g],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{24,255}\b/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];

function safeText(file) {
  try {
    const data = readFileSync(file);
    if (data.includes(0)) return "";
    return data.toString("utf8");
  } catch {
    return "";
  }
}

for (const file of textFiles) {
  const source = safeText(file);
  if (!source) continue;
  for (const [label, pattern] of credentialPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const value = match[0].toLowerCase();
      if (/replace_with|example|dummy|fixture|owner_test|private_test|^sk-test-/.test(value)) continue;
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${file}:${line} contains a possible ${label}`);
    }
  }
}

const activeBrowserFiles = [
  "vocab/index.html", "vocab/owner.html", "vocab/sw.js", "vocab/manifest.webmanifest",
  "vocab/js/public-app.js", "vocab/js/owner-app.js", "vocab/js/pwa.js", "vocab/js/runtime-config.js",
  "vocab/js/owner-api.js", "vocab/js/owner-storage.js", "vocab/js/sync-logic.js", "vocab/js/wordbook-schema.js",
  "vocab/js/review.js"
];
const activeBrowserSource = activeBrowserFiles.map((file) => `${file}\n${safeText(file)}`).join("\n");

const persistencePattern = /(?:localStorage|sessionStorage)[\s\S]{0,120}(?:access.?token|github.?token|api.?key|client.?secret)|(?:access.?token|github.?token|api.?key|client.?secret)[\s\S]{0,120}(?:localStorage|sessionStorage)/i;
if (persistencePattern.test(activeBrowserSource)) {
  findings.push("active browser bundle appears to persist a credential in Web Storage");
}
if (/type=["']password["']|personal access token|github[_ -]?pat/i.test(safeText("vocab/owner.html"))) {
  findings.push("owner UI exposes a browser-side credential input");
}
const sw = safeText("vocab/sw.js");
if (!/pathname\.startsWith\(["']\/api\/["']\)[\s\S]{0,180}fetch\(request\)/.test(sw)) {
  findings.push("Service Worker does not prove that /api/* is network-only");
}

if (findings.length) {
  console.error(`Secret boundary scan failed (${findings.length} finding${findings.length === 1 ? "" : "s"}):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret boundary scan passed: ${textFiles.length} repository files inspected; active browser assets contain no credential values or credential input/persistence path; /api/* is network-only in the Service Worker.`);
}
