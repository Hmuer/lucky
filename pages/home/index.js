const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");
const subscribe = require("../../utils/subscribe");

Page({
  data: {
    loading: true,
    latest: null,
    error: ""
  },

  onShow() {
    if (!auth.ensureLogin()) return;
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

  sync() {
    wx.showLoading({ title: "更新中" });
    api
      .sync()
      .then((data) => {
        wx.hideLoading();
        wx.showToast({
          title: data && data.saved > 0 ? "已更新" : "已是最新",
          icon: "none"
        });
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || "更新失败", icon: "none" });
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
