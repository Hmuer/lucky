const assert = require("assert");
const format = require("../utils/format");
const validate = require("../utils/validate");
const mapper = require("../utils/mapper");
const count = require("../utils/count");

let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log("  ✔ " + name);
}

console.log("[1] 金额与数字格式化");
test("分转元保留两位", () => assert.strictEqual(format.centsToYuan(3200), "32.00"));
test("变化值带正号", () => assert.strictEqual(format.changeText(500), "+5.00"));
test("负变化值", () => assert.strictEqual(format.changeText(-2700), "-27.00"));
test("数字补零", () => assert.strictEqual(format.two(3), "03"));
test("数字组文本", () => assert.strictEqual(format.numbersText([1, 2, 3]), "01 02 03"));

console.log("[2] 表单校验");
const base = {
  name: "我的组合",
  type: "single",
  main: [1, 2, 3, 4, 5, 6],
  special: [1],
  core: [],
  extra: [],
  unitValue: "2.00",
  startMode: "next",
  startCode: ""
};
const complexBase = {
  name: "复式组合",
  type: "complex",
  main: [1, 2, 3, 4, 5, 6, 7],
  special: [1, 2, 3],
  core: [],
  extra: [],
  unitValue: "2.00",
  startMode: "next",
  startCode: ""
};
const danTuoBase = {
  name: "核心",
  type: "danTuo",
  main: [],
  special: [7, 9],
  core: [1],
  extra: [2, 3, 4, 5, 6],
  unitValue: "2",
  startMode: "all",
  startCode: ""
};

test("基础组合合法", () => assert.strictEqual(validate.validateForm(base), ""));
test("基础组合少于 6 个主数字", () => {
  const form = Object.assign({}, base, { main: [1, 2, 3, 4, 5] });
  assert.ok(validate.validateForm(form).indexOf("6 个主数字") >= 0);
});
test("基础组合只能选 1 个特别数字", () => {
  const form = Object.assign({}, base, { special: [1, 2] });
  assert.ok(validate.validateForm(form).indexOf("1 个特别数字") >= 0);
});
test("基础组合未选特别数字", () => {
  const form = Object.assign({}, base, { special: [] });
  assert.ok(validate.validateForm(form).indexOf("特别数字") >= 0);
});
test("组合允许多个特别数字", () => assert.strictEqual(validate.validateForm(complexBase), ""));
test("组合特别数字超出范围", () => {
  const form = Object.assign({}, complexBase, { special: [17] });
  assert.ok(validate.validateForm(form).indexOf("特别数字超出范围") >= 0);
});
test("核心组合合法（多个特别数字）", () => assert.strictEqual(validate.validateForm(danTuoBase), ""));
test("核心组合扩展数字不足", () => {
  const form = Object.assign({}, danTuoBase, { extra: [2, 3, 4, 5] });
  assert.ok(validate.validateForm(form).indexOf("扩展数字至少") >= 0);
});
test("核心组合核心与扩展重复", () => {
  const form = Object.assign({}, danTuoBase, { extra: [1, 2, 3, 4, 5] });
  assert.ok(validate.validateForm(form).indexOf("不能重复") >= 0);
});
test("指定编号必须 7 位", () => {
  const form = Object.assign({}, base, { startMode: "custom", startCode: "123" });
  assert.ok(validate.validateForm(form).indexOf("7 位") >= 0);
});

console.log("[3] 组数计算");
test("基础组合 1 组", () => {
  assert.strictEqual(count.unitsOf("single", { red: [1, 2, 3, 4, 5, 6], blue: [3] }), 1);
});
test("组合 6 主数字 + 3 个特别数字 = 3 组", () => {
  assert.strictEqual(count.unitsOf("complex", { red: [1, 2, 3, 4, 5, 6], blue: [1, 2, 3] }), 3);
});
test("组合 7 主数字 + 2 个特别数字 = 14 组", () => {
  assert.strictEqual(count.unitsOf("complex", { red: [1, 2, 3, 4, 5, 6, 7], blue: [1, 2] }), 14);
});
test("核心组合 2 个扩展 + 2 个特别数字 = 2 组", () => {
  assert.strictEqual(
    count.unitsOf("danTuo", { redDan: [1], redTuo: [2, 3, 4, 5, 6], blue: [1, 2] }),
    2
  );
});
test("未选特别数字时组数为 0", () => {
  assert.strictEqual(count.unitsOf("complex", { red: [1, 2, 3, 4, 5, 6], blue: [] }), 0);
});

console.log("[4] 接口字段映射");
const recordRow = {
  id: 1,
  name: "我的组合",
  type: "complex",
  payload: { red: [1, 2, 3, 4, 5, 6], blue: [7] },
  unitPrice: 200,
  buyEnabled: true,
  active: true,
  startCode: "2026002"
};
test("组合映射为中文字段", () => {
  const record = mapper.mapRecord(recordRow);
  assert.strictEqual(record.typeLabel, "组合");
  assert.deepStrictEqual(record.main, [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(record.special, [7]);
  assert.strictEqual(record.unitValue, "2.00");
  assert.strictEqual(record.eachTime, true);
});
test("组合映射多个特别数字", () => {
  const record = mapper.mapRecord(
    Object.assign({}, recordRow, { payload: { red: [1, 2, 3, 4, 5, 6], blue: [9, 1, 5] } })
  );
  assert.deepStrictEqual(record.special, [1, 5, 9]);
});
test("回填表单保留全部特别数字", () => {
  const form = mapper.mapRecordToForm(mapper.mapRecord(
    Object.assign({}, recordRow, { payload: { red: [1, 2, 3, 4, 5, 6], blue: [1, 5, 9] } })
  ));
  assert.deepStrictEqual(form.special, [1, 5, 9]);
  assert.deepStrictEqual(mapper.toCreatePayload(form).payload.blue, [1, 5, 9]);
});
test("最新结果映射", () => {
  const latest = mapper.mapLatest({
    draw: { code: "2026001", date: "2026-01-01", red: [1, 2, 3, 4, 5, 6], blue: 7 },
    hits: [
      {
        betId: 1,
        name: "我的组合",
        type: "complex",
        units: 1,
        cost: 200,
        tierCounts: { 6: 1 },
        winAmount: 500,
        profit: 300
      }
    ],
    summary: { cost: 200, winAmount: 500, profit: 300 }
  });
  assert.strictEqual(latest.code, "2026001");
  assert.strictEqual(latest.records.length, 1);
  assert.strictEqual(latest.records[0].matchesText, "6 级 ×1");
  assert.strictEqual(latest.records[0].changeText, "+3.00");
  assert.strictEqual(latest.summary.valueText, "2.00");
});
test("统计映射", () => {
  const stats = mapper.mapStats({
    summary: { periods: 10, winsCount: 3, cost: 2000, winAmount: 500, profit: -1500, tierCounts: { 6: 2 } },
    bets: [
      {
        betId: 1,
        name: "我的组合",
        type: "single",
        periods: 10,
        winsCount: 3,
        cost: 2000,
        winAmount: 500,
        profit: -1500,
        bestWin: 500,
        tierCounts: { 6: 2 }
      }
    ]
  });
  assert.strictEqual(stats.summary.periods, 10);
  assert.strictEqual(stats.summary.changeText, "-15.00");
  assert.strictEqual(stats.summary.levels[0].label, "6 级");
  assert.strictEqual(stats.records[0].bestText, "¥5.00");
});
test("基础组合提交字段", () => {
  const payload = mapper.toCreatePayload(base);
  assert.strictEqual(payload.type, "single");
  assert.deepStrictEqual(payload.payload.red, [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(payload.payload.blue, [1]);
  assert.strictEqual(payload.unit_price, 200);
  assert.strictEqual(payload.start_code_mode, "next");
});
test("核心组合提交字段（单个特别数字兼容写法）", () => {
  const payload = mapper.toCreatePayload({
    name: "核心",
    type: "danTuo",
    main: [],
    special: 7,
    core: [1],
    extra: [2, 3, 4, 5, 6],
    unitValue: "2",
    eachTime: true,
    enabled: true,
    startMode: "all",
    startCode: ""
  });
  assert.deepStrictEqual(payload.payload.redDan, [1]);
  assert.deepStrictEqual(payload.payload.redTuo, [2, 3, 4, 5, 6]);
  assert.deepStrictEqual(payload.payload.blue, [7]);
});
test("多选特别数字提交字段", () => {
  const payload = mapper.toCreatePayload(
    Object.assign({}, complexBase, { special: [9, 1, 5, 1] })
  );
  assert.deepStrictEqual(payload.payload.blue, [1, 5, 9]);
});

console.log("[5] 走势数据");
const trend = require("../utils/trend");
const trendSeries = trend.buildSeries([
  { code: "2026001", date: "2026-01-03", cost: 200, win: 500 },
  { code: "2026002", date: "2026-01-06", cost: 400, win: 0 }
]);
test("累计走势累加", () => {
  assert.strictEqual(trendSeries[0].cumCost, 200);
  assert.strictEqual(trendSeries[0].cumWin, 500);
  assert.strictEqual(trendSeries[0].profit, 300);
  assert.strictEqual(trendSeries[1].cumCost, 600);
  assert.strictEqual(trendSeries[1].profit, -100);
});
test("时间范围裁剪后重新累计", () => {
  const series = trend.buildSeries([
    { code: "a", date: "2026-01-01", cost: 100, win: 0 },
    { code: "b", date: "2026-06-01", cost: 100, win: 0 },
    { code: "c", date: "2026-10-01", cost: 100, win: 0 }
  ]);
  const picked = trend.filterByRange(series, 90);
  assert.strictEqual(picked.length, 1);
  assert.strictEqual(picked[0].code, "c");
  assert.strictEqual(picked[0].cumCost, 100);
});
test("范围汇总", () => {
  const summary = trend.summarize(trendSeries);
  assert.strictEqual(summary.count, 2);
  assert.strictEqual(summary.cost, 600);
  assert.strictEqual(summary.win, 500);
  assert.strictEqual(summary.profit, -100);
});
test("坐标轴金额文本", () => {
  assert.strictEqual(trend.axisText(999), "999");
  assert.strictEqual(trend.axisText(1500), "1.5千");
  assert.strictEqual(trend.axisText(20000), "2.0万");
  assert.strictEqual(trend.axisText(-12000), "-1.2万");
});
test("历史核对映射为走势序列（只含启用组合、按期号升序）", () => {
  const series = mapper.mapTrend(
    {
      items: [
        {
          draw: { code: "2026002", date: "2026-01-06" },
          hits: [
            { betId: 1, cost: 400, winAmount: 0 },
            { betId: 2, cost: 200, winAmount: 0 }
          ]
        },
        {
          draw: { code: "2026001", date: "2026-01-03" },
          hits: [{ betId: 1, cost: 200, winAmount: 500 }]
        }
      ]
    },
    { 1: true }
  );
  assert.strictEqual(series.length, 2);
  assert.strictEqual(series[0].code, "2026001");
  assert.strictEqual(series[0].cost, 200);
  assert.strictEqual(series[0].win, 500);
  assert.strictEqual(series[1].cumCost, 600);
  assert.strictEqual(series[1].cumWin, 500);
});

console.log("[6] 广告配置");
const ad = require("../utils/ad");
test("未配置广告位时不展示广告", () => {
  assert.strictEqual(ad.bannerUnitId(), "");
  assert.strictEqual(ad.interstitialUnitId(), "");
});

console.log("\n✅ " + passed + " 项测试通过");
