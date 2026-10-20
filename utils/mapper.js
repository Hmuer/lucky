const format = require("./format");

const TYPE_META = {
  single: { label: "基础", description: "6 个主数字 + 1 个特别数字" },
  complex: { label: "组合", description: "6~20 个主数字 + 1 个特别数字" },
  danTuo: { label: "核心组合", description: "1~5 个核心数字 + 扩展数字 + 1 个特别数字" }
};

function typeLabel(type) {
  return (TYPE_META[type] || { label: "组合" }).label;
}

function typeDescription(type) {
  return (TYPE_META[type] || { description: "" }).description;
}

function matchesText(tierCounts) {
  const source = tierCounts || {};
  const keys = Object.keys(source)
    .map(Number)
    .filter(function (n) {
      return n >= 1 && n <= 6 && Number(source[n]) > 0;
    })
    .sort(function (a, b) {
      return a - b;
    });
  if (!keys.length) return "未匹配";
  return keys
    .map(function (n) {
      return n + " 级 ×" + source[n];
    })
    .join(" / ");
}

function levelItems(tierCounts) {
  const source = tierCounts || {};
  return [1, 2, 3, 4, 5, 6]
    .map(function (n) {
      return {
        key: n,
        label: n + " 级",
        count: Number(source[n]) || 0
      };
    })
    .filter(function (item) {
      return item.count > 0;
    });
}

function mapRecord(row) {
  const payload = row.payload || {};
  const special = (payload.blue || [])[0];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    typeLabel: typeLabel(row.type),
    typeDescription: typeDescription(row.type),
    main: payload.red || [],
    core: payload.redDan || [],
    extra: payload.redTuo || [],
    special: special || null,
    unitValue: format.centsToYuan(row.unitPrice),
    eachTime: !!row.buyEnabled,
    enabled: !!row.active,
    startCode: row.startCode || ""
  };
}

function mapHit(hit) {
  return {
    recordId: hit.betId,
    name: hit.name,
    typeLabel: typeLabel(hit.type),
    units: hit.units,
    valueText: format.centsToYuan(hit.cost),
    changeText: format.changeText(hit.profit),
    changeClass: format.changeClass(hit.profit),
    matchesText: matchesText(hit.tierCounts)
  };
}

function mapLatest(data) {
  if (!data || !data.draw) return null;
  const draw = data.draw;
  const records = (data.hits || []).map(mapHit);
  const summary = data.summary || { cost: 0, winAmount: 0, profit: 0 };
  return {
    code: draw.code,
    date: draw.date,
    main: draw.red || [],
    special: draw.blue,
    records: records,
    summary: {
      valueText: format.centsToYuan(summary.cost),
      changeText: format.changeText(summary.profit),
      changeClass: format.changeClass(summary.profit)
    }
  };
}

function mapHistory(data) {
  const items = (data && data.items) || [];
  return items.map(function (item) {
    const draw = item.draw || {};
    const records = (item.hits || []).map(mapHit);
    const summary = item.summary || { cost: 0, winAmount: 0, profit: 0 };
    return {
      code: draw.code,
      date: draw.date,
      main: draw.red || [],
      special: draw.blue,
      records: records,
      summary: {
        valueText: format.centsToYuan(summary.cost),
        changeText: format.changeText(summary.profit),
        changeClass: format.changeClass(summary.profit)
      }
    };
  });
}

function mapStats(data) {
  const summary = (data && data.summary) || {};
  const rows = (data && data.bets) || [];
  return {
    summary: {
      periods: summary.periods || 0,
      hitPeriods: summary.winsCount || 0,
      valueText: format.centsToYuan(summary.cost),
      changeText: format.changeText(summary.profit),
      changeClass: format.changeClass(summary.profit),
      levels: levelItems(summary.tierCounts)
    },
    records: rows.map(function (row) {
      return {
        id: row.betId,
        name: row.name,
        typeLabel: typeLabel(row.type),
        periods: row.periods,
        hitPeriods: row.winsCount,
        valueText: format.centsToYuan(row.cost),
        changeText: format.changeText(row.profit),
        changeClass: format.changeClass(row.profit),
        bestText: row.bestWin > 0 ? "¥" + format.centsToYuan(row.bestWin) : "—",
        levels: levelItems(row.tierCounts)
      };
    })
  };
}

function mapRecordToForm(record) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    main: (record.main || []).slice(),
    special: record.special ? [record.special] : [],
    core: (record.core || []).slice(),
    extra: (record.extra || []).slice(),
    unitValue: record.unitValue,
    eachTime: record.eachTime,
    enabled: record.enabled,
    startCode: record.startCode || "",
    startMode: record.startCode ? "custom" : "all"
  };
}

function toCreatePayload(form) {
  const special = Array.isArray(form.special) ? form.special[0] : form.special;
  const payload =
    form.type === "danTuo"
      ? { redDan: form.core, redTuo: form.extra, blue: [special] }
      : { red: form.main, blue: [special] };
  return {
    name: String(form.name || "").trim(),
    type: form.type,
    payload: payload,
    unit_price: Math.round(Number(form.unitValue) * 100),
    buy_enabled: !!form.eachTime,
    active: !!form.enabled,
    start_code_mode: form.startMode,
    start_code: form.startMode === "custom" ? String(form.startCode || "") : null
  };
}

module.exports = {
  TYPE_META,
  typeLabel,
  typeDescription,
  matchesText,
  levelItems,
  mapRecord,
  mapHit,
  mapLatest,
  mapHistory,
  mapStats,
  mapRecordToForm,
  toCreatePayload
};
