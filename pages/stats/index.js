const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");
const trend = require("../../utils/trend");
const chart = require("../../utils/chart");

const RANGES = [
  { key: "1w", label: "1 周", days: 7 },
  { key: "1m", label: "1 月", days: 30 },
  { key: "3m", label: "3 月", days: 90 },
  { key: "6m", label: "半年", days: 180 },
  { key: "1y", label: "1 年", days: 365 },
  { key: "all", label: "全部", days: 0 }
];

Page({
  data: {
    loading: true,
    stats: null,
    error: "",
    ranges: RANGES,
    rangeKey: "3m",
    trendCount: 0,
    trendCostText: "0.00",
    trendChangeText: "0.00",
    trendChangeClass: ""
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    Promise.all([api.getStats(), api.getHistory(), api.getRecords()])
      .then((results) => {
        const stats = mapper.mapStats(results[0]);
        const activeIds = {};
        ((results[2] && results[2].bets) || []).forEach((row) => {
          if (row.active) activeIds[row.id] = true;
        });
        this.allSeries = mapper.mapTrend(results[1], activeIds);
        this.setData({ stats: stats, loading: false }, () => this.applyRange());
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || "加载失败"
        });
      });
  },

  setRange(event) {
    const key = event.currentTarget.dataset.key;
    if (key === this.data.rangeKey) return;
    this.setData({ rangeKey: key }, () => this.applyRange());
  },

  applyRange() {
    const range = RANGES.filter((item) => item.key === this.data.rangeKey)[0] || RANGES[2];
    const points = trend.filterByRange(this.allSeries || [], range.days);
    const summary = trend.summarize(points);
    this.chartPoints = points;

    const change = summary.profit;
    this.setData(
      {
        trendCount: summary.count,
        trendCostText: (summary.cost / 100).toFixed(2),
        trendChangeText: (change > 0 ? "+" : "") + (change / 100).toFixed(2),
        trendChangeClass: change > 0 ? "change-up" : change < 0 ? "change-down" : ""
      },
      () => this.drawTrend()
    );
  },

  drawTrend() {
    const points = this.chartPoints || [];
    const query = wx.createSelectorQuery().in(this);
    query
      .select("#trendCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node || !item.width || !item.height) return;
        const canvas = item.node;
        let ratio = 2;
        try {
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          ratio = info.pixelRatio || 2;
        } catch (e) {
          ratio = 2;
        }
        canvas.width = item.width * ratio;
        canvas.height = item.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx.scale(ratio, ratio);
        chart.draw(ctx, item.width, item.height, points);
      });
  }
});
