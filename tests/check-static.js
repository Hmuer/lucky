const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["tests", "node_modules", ".git", "miniprogram_npm"]);
const PROHIBITED = [
  "\u5f69\u7968",
  "\u53cc\u8272\u7403",
  "\u5f00\u5956",
  "\u6295\u6ce8",
  "\u8d2d\u4e70",
  "\u4e2d\u5956",
  "\u5956\u91d1",
  "\u7ea2\u7403",
  "\u84dd\u7403",
  "\u5b88\u53f7",
  "\u76c8\u4e8f",
  "\u7b49\u5956",
  "\u80c6\u62d6",
  "\u590d\u5f0f",
  "\u5355\u5f0f",
  "\u671f\u53f7",
  "\u5956\u6c60",
  "\u9500\u552e\u989d"
];

const failures = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(name);
    if (![".js", ".json", ".wxml", ".wxss", ".md"].includes(ext)) continue;
    const rel = path.relative(ROOT, full);
    const text = fs.readFileSync(full, "utf8");

    for (const word of PROHIBITED) {
      if (text.includes(word)) failures.push(rel + " 含敏感词: " + word);
    }

    if (ext === ".json") {
      try {
        JSON.parse(text);
      } catch (e) {
        failures.push(rel + " JSON 不合法: " + e.message);
      }
    }

    if (ext === ".js") {
      try {
        childProcess.execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
      } catch (e) {
        failures.push(rel + " JS 语法错误");
      }
    }
  }
}

walk(ROOT);

if (failures.length) {
  console.error("❌ 静态检查失败：");
  for (const item of failures) console.error("  - " + item);
  process.exit(1);
}

console.log("✅ 静态检查通过：JSON 合法、JS 语法正确、界面无敏感词");
