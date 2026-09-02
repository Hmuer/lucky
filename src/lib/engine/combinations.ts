/**
 * 数学工具：组合数（用对数加法避免大数溢出，最后用 BigInt 落地）
 * 注：双色球场景下 n <= 33，C(33,16) ≈ 1.1e8，远在 number 安全范围内
 */

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  return Math.round(Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k)));
}

/** 枚举 k 元素子集（按升序） */
export function combinations<T>(arr: T[], k: number): T[][] {
  const n = arr.length;
  if (k > n || k <= 0) return [];
  const out: T[][] = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}
