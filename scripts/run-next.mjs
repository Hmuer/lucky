#!/usr/bin/env node
/**
 * Next.js 启动包装器：自动选择能加载 better-sqlite3 的 Node 运行时。
 *
 * 背景：better-sqlite3 是原生模块，ABI 与安装依赖时的 Node 主版本绑定。
 * 宿主机上可能同时存在多个 Node（如 22 和 24），直接用错版本执行
 * next build 会在预渲染阶段报 NODE_MODULE_VERSION 不匹配。
 *
 * 优先使用项目内固定运行时 .runtime/node（由 scripts/bootstrap-node.sh 安装），
 * 找不到时再回退到宿主的 Node。探测方式是实际打开一次内存 SQLite，
 * 确保该 Node 能加载 better-sqlite3 的原生 addon。
 *
 * 用法：
 *   node scripts/run-next.mjs build
 *   node scripts/run-next.mjs dev -H 127.0.0.1 -p 3000
 *   node scripts/run-next.mjs start -H 127.0.0.1 -p 3000
 *
 * 可用 NODE_BIN 指定优先探测的 Node。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const dbModule = path.join(root, "node_modules", "better-sqlite3");
const projectNode = path.join(root, ".runtime", "node", "bin", "node");

if (!existsSync(nextBin)) {
  console.error(`找不到 Next.js：${nextBin}，请先执行：./scripts/npm.sh ci`);
  process.exit(1);
}
if (!existsSync(dbModule)) {
  console.error(`找不到 better-sqlite3：${dbModule}，请先执行：./scripts/npm.sh ci`);
  process.exit(1);
}

const candidates = [
  process.env.NODE_BIN,
  projectNode,
  process.execPath,
  "/usr/bin/node",
  "/usr/local/bin/node",
  "/root/.local/bin/node",
  "/opt/node24/bin/node",
].filter(Boolean);

const seen = new Set();
let node = null;
for (const candidate of candidates) {
  if (seen.has(candidate) || !existsSync(candidate)) continue;
  seen.add(candidate);
  // 必须真正实例化一次，require() 本身不会加载原生 addon
  const probe = spawnSync(
    candidate,
    ["-e", `const D=require(${JSON.stringify(dbModule)}); new D(":memory:").close();`],
    { cwd: root, stdio: "ignore" }
  );
  if (probe.status === 0) {
    node = candidate;
    break;
  }
}

if (!node) {
  console.error("找不到能加载 better-sqlite3 的 Node（原生模块 ABI 不匹配）。");
  console.error("请用运行服务的同一个 Node 执行：npm rebuild better-sqlite3");
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ""}`,
};

console.log(`[run-next] Node: ${node}`);
const child = spawn(node, [nextBin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {}
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
