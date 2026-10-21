/**
 * 统计页累计走势折线图（Canvas 2D 绘制）
 * 三条线：累计记录、累计回补、累计变化；金额由分换算成元。
 */

const SERIES = [
  { key: "cumCost", label: "累计记录", color: "#94a3b8" },
  { key: "cumWin", label: "累计回补", color: "#38bdf8" },
  { key: "profit", label: "累计变化", color: "#fb7185" }
];

const PAD = { left: 44, right: 10, top: 28, bottom: 24 };

/** 把 step 收成 1/2/5×10^n 的整数刻度 */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log(raw) / Math.LN10);
  const base = Math.pow(10, exp);
  const norm = raw / base;
  if (norm <= 1) return base;
  if (norm <= 2) return 2 * base;
  if (norm <= 5) return 5 * base;
  return 10 * base;
}

function draw(ctx, width, height, points) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!points || !points.length) return;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  if (plotW <= 10 || plotH <= 10) return;

  // 元为单位
  const values = points.map(function (item) {
    return {
      cumCost: item.cumCost / 100,
      cumWin: item.cumWin / 100,
      profit: item.profit / 100
    };
  });

  let lo = 0;
  let hi = 0;
  values.forEach(function (item) {
    [item.cumCost, item.cumWin, item.profit].forEach(function (value) {
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    });
  });
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  // 取整到 1/2/5×10^n 的刻度，让 Y 轴标签干净
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = Math.max(1, Math.round((hi - lo) / step));

  const xOf = function (index) {
    if (points.length === 1) return PAD.left + plotW / 2;
    return PAD.left + (plotW * index) / (points.length - 1);
  };
  const yOf = function (value) {
    return PAD.top + plotH - ((value - lo) / (hi - lo)) * plotH;
  };

  ctx.font = "10px sans-serif";
  ctx.textBaseline = "middle";

  // 横向网格 + Y 轴刻度
  for (let i = 0; i <= ticks; i++) {
    const value = lo + step * i;
    const y = yOf(value);
    ctx.strokeStyle = "#1f2a44";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(width - PAD.right, y);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "right";
    ctx.fillText(axisLabel(value), PAD.left - 6, y);
  }

  // 底部基线
  ctx.strokeStyle = "#243449";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(width - PAD.right, PAD.top + plotH);
  ctx.stroke();

  // 三条折线
  SERIES.forEach(function (series) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    values.forEach(function (item, index) {
      const x = xOf(index);
      const y = yOf(item[series.key]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (points.length === 1) {
      ctx.fillStyle = series.color;
      ctx.beginPath();
      ctx.arc(xOf(0), yOf(values[0][series.key]), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 图例
  let legendX = PAD.left;
  ctx.textAlign = "left";
  SERIES.forEach(function (series) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX, 12);
    ctx.lineTo(legendX + 14, 12);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(series.label, legendX + 18, 12);
    legendX += 18 + ctx.measureText(series.label).width + 14;
  });

  // X 轴日期：跨年时显示年月，同年显示月日
  const firstDate = String(points[0].date || "");
  const lastDate = String(points[points.length - 1].date || "");
  const crossYear = firstDate.slice(0, 4) !== lastDate.slice(0, 4);
  const stepIndex = Math.max(1, Math.ceil((points.length - 1) / 3));
  const indexes = [];
  for (let i = 0; i < points.length; i += stepIndex) indexes.push(i);
  if (indexes[indexes.length - 1] !== points.length - 1) indexes.push(points.length - 1);

  ctx.fillStyle = "#64748b";
  indexes.forEach(function (index) {
    const item = points[index];
    const date = String(item.date || "");
    const label = date.length >= 10 ? (crossYear ? date.slice(0, 7) : date.slice(5)) : String(item.code || "");
    if (index === 0) {
      ctx.textAlign = "left";
      ctx.fillText(label, PAD.left, PAD.top + plotH + 12);
    } else if (index === points.length - 1) {
      ctx.textAlign = "right";
      ctx.fillText(label, width - PAD.right, PAD.top + plotH + 12);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(label, xOf(index), PAD.top + plotH + 12);
    }
  });
}

/** 元 → 刻度文字 */
function axisLabel(yuan) {
  const value = Number(yuan) || 0;
  const abs = Math.abs(value);
  if (abs >= 10000) return (value / 10000).toFixed(1) + "万";
  if (abs >= 1000) return (value / 1000).toFixed(1) + "千";
  return String(Math.round(value));
}

module.exports = {
  SERIES,
  niceStep,
  draw
};
