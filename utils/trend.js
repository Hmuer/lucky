/**
 * 走势数据整理：把历史核对数据换算成累计序列，并按时间窗口裁剪重算。
 * 金额单位统一为分，绘制时再换算成元。
 */

function parseDate(text) {
  const value = String(text || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
}

/** 把 [{code,date,cost,win}] 按顺序累加成走势序列 */
function buildSeries(items) {
  let cumCost = 0;
  let cumWin = 0;
  return (items || []).map(function (item) {
    const cost = Number(item.cost) || 0;
    const win = Number(item.win) || 0;
    cumCost += cost;
    cumWin += win;
    return {
      code: item.code,
      date: item.date,
      cost: cost,
      win: win,
      cumCost: cumCost,
      cumWin: cumWin,
      profit: cumWin - cumCost
    };
  });
}

/**
 * 按"距最后一条记录不超过 days 天"裁剪，并在窗口内从 0 重新累计。
 * days 为 0 或空时表示全部。
 */
function filterByRange(series, days) {
  const list = series || [];
  if (!list.length || !days) return list.slice();
  const last = list[list.length - 1];
  const lastTime = parseDate(last.date);
  if (lastTime === null) return list.slice();
  const cutoff = lastTime - Number(days) * 24 * 3600 * 1000;
  const picked = list.filter(function (item) {
    const time = parseDate(item.date);
    return time === null || time >= cutoff;
  });
  return buildSeries(
    picked.map(function (item) {
      return { code: item.code, date: item.date, cost: item.cost, win: item.win };
    })
  );
}

/** 窗口内的汇总（分） */
function summarize(series) {
  const list = series || [];
  const result = { count: list.length, cost: 0, win: 0, profit: 0 };
  list.forEach(function (item) {
    result.cost += Number(item.cost) || 0;
    result.win += Number(item.win) || 0;
  });
  result.profit = result.win - result.cost;
  return result;
}

/** Y 轴刻度文字（传入元） */
function axisText(yuan) {
  const value = Number(yuan) || 0;
  const abs = Math.abs(value);
  if (abs >= 10000) return (value / 10000).toFixed(1) + "万";
  if (abs >= 1000) return (value / 1000).toFixed(1) + "千";
  return String(Math.round(value));
}

module.exports = {
  parseDate,
  buildSeries,
  filterByRange,
  summarize,
  axisText
};
