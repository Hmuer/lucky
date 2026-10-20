const assert = require("assert");
const format = require("../utils/format");
const validate = require("../utils/validate");
const mapper = require("../utils/mapper");

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
test("基础组合合法", () => assert.strictEqual(validate.validateForm(base), ""));
test("基础组合少于 6 个主数字", () => {
  const form = Object.assign({}, base, { main: [1, 2, 3, 4, 5] });
  assert.ok(validate.validateForm(form).indexOf("6 个主数字") >= 0);
});
test("特别数字必选 1 个", () => {
  const form = Object.assign({}, base, { special: [] });
  assert.ok(validate.validateForm(form).indexOf("特别数字") >= 0);
});
test("核心组合合法", () => {
  const form = {
    name: "核心",
    type: "danTuo",
    main: [],
    special: [7],
    core: [1],
    extra: [2, 3, 4, 5, 6],
    unitValue: "2",
    startMode: "all",
    startCode: ""
  };
  assert.strictEqual(validate.validateForm(form), "");
});
test("核心组合扩展数字不足", () => {
  const form = {
    name: "核心",
    type: "danTuo",
    main: [],
    special: [7],
    core: [1],
    extra: [2, 3, 4, 5],
    unitValue: "2",
    startMode: "all",
    startCode: ""
  };
  assert.ok(validate.validateForm(form).indexOf("扩展数字至少") >= 0);
});
test("指定编号必须 7 位", () => {
  const form = Object.assign({}, base, { startMode: "custom", startCode: "123" });
  assert.ok(validate.validateForm(form).indexOf("7 位") >= 0);
});

console.log("[3] 接口字段映射");
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
  assert.strictEqual(record.special, 7);
  assert.strictEqual(record.unitValue, "2.00");
  assert.strictEqual(record.eachTime, true);
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
test("核心组合提交字段", () => {
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

console.log("\n✅ " + passed + " 项测试通过");
