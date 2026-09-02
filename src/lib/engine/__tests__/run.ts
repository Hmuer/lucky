/**
 * 引擎自测：覆盖单式 / 复式 / 胆拖 + 各奖级
 * 运行：npm run test:engine
 */

import { settle } from "../settle";
import { countUnits } from "../expand";
import type { Bet, Draw } from "../types";

function expect(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✔ ${name}`);
  } else {
    console.error(`  ✘ ${name}`, detail);
    process.exitCode = 1;
  }
}

console.log("\n[1] 单式命中规则");
{
  const draw: Draw = { red: [3, 7, 12, 18, 25, 28], blue: 5 };
  const bet: Bet = { type: "single", red: [3, 7, 12, 18, 25, 28], blue: [5] };
  const r = settle(bet, draw, { prizeAmounts: { 1: 8881916 } });
  expect("6+1 一等奖", r.tierBreakdown[1]?.count === 1, r);
  expect("金额取浮动值 8,881,916", r.totalAmount === 8881916, r.totalAmount);

  const bet2: Bet = { type: "single", red: [3, 7, 12, 18, 25, 1], blue: [5] };
  const r2 = settle(bet2, draw);
  expect("5+1 三等奖 3000", r2.tierBreakdown[3]?.count === 1 && r2.totalAmount === 3000, r2);
}

console.log("\n[2] 复式 - 6 红 + 16 蓝（用户场景）");
{
  // 用户守号：6 红 + 16 蓝 → 1 * 16 = 16 注
  const red = [3, 7, 12, 18, 25, 28];
  const blue = Array.from({ length: 16 }, (_, i) => i + 1);
  const bet: Bet = { type: "complex", red, blue };
  expect("注数 = 1 * 16 = 16", countUnits(bet) === 16);

  // 开奖：红与守号完全一致，蓝开 5
  const draw: Draw = { red: [...red].sort((a, b) => a - b), blue: 5 };
  const r = settle(bet, draw, { prizeAmounts: { 1: 8881916, 2: 106063 } });
  expect("16 注里 1 注 6+1，其余 6+0", r.tierBreakdown[1]?.count === 1 && r.tierBreakdown[2]?.count === 15, r.tierBreakdown);
  expect("总奖金 = 一等 + 15*二等", r.totalAmount === 8881916 + 15 * 106063, r.totalAmount);
}

console.log("\n[3] 复式 - 7 红 + 2 蓝 → C(7,6)*2 = 14 注");
{
  const bet: Bet = {
    type: "complex",
    red: [1, 2, 3, 4, 5, 6, 7],
    blue: [3, 9],
  };
  expect("注数 = 7*2 = 14", countUnits(bet) === 14);
  const draw: Draw = { red: [1, 2, 3, 4, 5, 6], blue: 9 };
  const r = settle(bet, draw, { prizeAmounts: { 1: 10000000 } });
  // 7 红展开 7 个 6 红组合，其中 1 个命中 6 红；每个组合 ×2 蓝
  // 命中 6+1：1 注；命中 6+0：1 注
  expect("1 注 6+1 + 1 注 6+0", r.tierBreakdown[1]?.count === 1 && r.tierBreakdown[2]?.count === 1);
}

console.log("\n[4] 胆拖 - 边界抛错");
{
  // 红胆 6：need = 0，应抛错
  try {
    expandToTickets({ type: "danTuo", redDan: [1, 2, 3, 4, 5, 6], redTuo: [7, 8, 9], blue: [1] });
    expect("红胆数 =6 期望抛错", false);
  } catch (e) {
    expect("红胆数 =6 抛错", true);
  }
  // 红拖不够：need > 红拖数，应抛错
  try {
    expandToTickets({ type: "danTuo", redDan: [1, 2, 3, 4, 5], redTuo: [6], blue: [1] });
    expect("红拖数不足 期望抛错", false);
  } catch (e) {
    expect("红拖数不足抛错", true);
  }
}

console.log("\n[5] 胆拖 - 1 胆 + 6 拖 + 1 蓝");
{
  const bet: Bet = { type: "danTuo", redDan: [3], redTuo: [1, 7, 12, 18, 25, 28], blue: [5] };
  expect("注数 = C(6,5)*1 = 6", countUnits(bet) === 6);

  // 展开的 6 注里只有 1 注红球 = [1,3,7,12,18,25]
  // 开奖 [1,3,7,12,18,25] + 蓝 9：1 注 6+0 + 5 注 5+0
  const draw: Draw = { red: [1, 3, 7, 12, 18, 25], blue: 9 };
  const r = settle(bet, draw);
  expect("1 注 6+0 + 5 注 5+0", r.tierBreakdown[2]?.count === 1 && r.tierBreakdown[4]?.count === 5, r.tierBreakdown);

  // 开奖 = [3,7,12,18,25,28]，拖全部都在开奖里；6 注里：
  //   - 1 注 = [3,7,12,18,25,28]，6+1
  //   - 5 注各含 5 红 + 蓝中 = 5+1
  // 总奖金 = 一等(浮动0) + 5*3000 = 15000
  const draw2: Draw = { red: [3, 7, 12, 18, 25, 28], blue: 5 };
  const r2 = settle(bet, draw2);
  expect("开奖全拖：1 注 6+1 + 5 注 5+1", r2.tierBreakdown[1]?.count === 1 && r2.tierBreakdown[3]?.count === 5, r2.tierBreakdown);
}

console.log("\n[6] 低奖级 - 0+1 六等奖");
{
  const draw: Draw = { red: [3, 7, 12, 18, 25, 28], blue: 5 };
  const bet: Bet = { type: "single", red: [1, 2, 9, 10, 11, 13], blue: [5] };
  const r = settle(bet, draw);
  expect("0+1 六等奖 = 5", r.tierBreakdown[6]?.count === 1 && r.totalAmount === 5);
}

console.log("\n[7] 未中奖");
{
  const draw: Draw = { red: [3, 7, 12, 18, 25, 28], blue: 5 };
  const bet: Bet = { type: "single", red: [1, 2, 9, 10, 11, 13], blue: [9] };
  const r = settle(bet, draw);
  expect("红 0 + 蓝 0 = 不中奖", r.totalAmount === 0 && Object.keys(r.tierBreakdown).length === 0);
}

if (process.exitCode) console.error("\n❌ 自测失败");
else console.log("\n✅ 自测全部通过");
