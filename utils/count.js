/**
 * 组合数 / 组数计算
 * 与 main 分支 engine/expand.ts 的 countUnits 保持一致：
 * - single（基础）：固定 1 组
 * - complex（组合）：C(主数字个数, 6) × 特别数字个数
 * - danTuo（核心组合）：C(扩展数字个数, 6 - 核心数字个数) × 特别数字个数
 */

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < size; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * 按表单/协议字段计算组数
 * payload: { red, blue, redDan, redTuo }
 */
function unitsOf(type, payload) {
  const source = payload || {};
  const blue = (source.blue || []).length;
  if (!blue) return 0;

  if (type === "single") {
    return (source.red || []).length === 6 && blue === 1 ? 1 : 0;
  }
  if (type === "complex") {
    return comb((source.red || []).length, 6) * blue;
  }
  if (type === "danTuo") {
    const dan = (source.redDan || []).length;
    const tuo = (source.redTuo || []).length;
    const need = 6 - dan;
    if (need <= 0 || tuo < need) return 0;
    return comb(tuo, need) * blue;
  }
  return 0;
}

module.exports = {
  comb,
  unitsOf
};
