/**
 * npm install / npm ci 前置守卫。
 *
 * better-sqlite3 是原生模块，ABI 与 Node 主版本绑定。用错 Node 安装后，
 * 运行时会出现 NODE_MODULE_VERSION 不匹配。这里在安装前就拦住，
 * 并提示改用项目内固定运行时 .runtime/node。
 *
 * 只比较主版本：同一主版本内 ABI 兼容，允许系统 Node 22 临时安装。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wanted = readFileSync(path.join(root, ".node-version"), "utf8").trim();
const wantedMajor = wanted.split(".")[0];
const current = process.versions.node;
const currentMajor = current.split(".")[0];

if (currentMajor !== wantedMajor) {
  console.error(`[runtime] 当前 Node ${current}，项目锁定 Node ${wanted}。`);
  console.error("[runtime] 请先安装并使用项目内运行时：");
  console.error("[runtime]   ./scripts/bootstrap-node.sh");
  console.error("[runtime]   ./scripts/npm.sh ci");
  process.exit(1);
}

if (current !== wanted) {
  console.warn(`[runtime] 提示：当前 Node ${current}，项目锁定 ${wanted}（主版本相同，ABI 兼容）`);
}
