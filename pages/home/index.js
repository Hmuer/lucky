const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");
const subscribe = require("../../utils/subscribe");
const ad = require("../../utils/ad");

Page({
  data: {
    loading: true,
    latest: null,
    error: ""
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    ad.showLaunchInterstitial();
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .getLatest()
      .then((data) => {
        this.setData({
          latest: mapper.mapLatest(data),
          loading: false
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || "加载失败"
        });
      });
  },

  goRecords() {
    wx.navigateTo({ url: "/pages/records/index" });
  },

  goHistory() {
    wx.navigateTo({ url: "/pages/history/index" });
  },

  goStats() {
    wx.navigateTo({ url: "/pages/stats/index" });
  },

  notify() {
    subscribe.enableNotifications();
  }
});
