const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");

Page({
  data: {
    loading: true,
    records: [],
    error: ""
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .getRecords()
      .then((data) => {
        this.setData({
          records: (data.bets || []).map(mapper.mapRecord),
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

  add() {
    wx.navigateTo({ url: "/pages/record-form/index" });
  },

  edit(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/record-form/index?id=" + id });
  },

  remove(event) {
    const id = event.currentTarget.dataset.id;
    const self = this;
    wx.showModal({
      title: "删除组合",
      content: "确定删除这个组合吗？",
      confirmText: "删除",
      confirmColor: "#fb7185",
      success(res) {
        if (!res.confirm) return;
        api
          .deleteRecord(id)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            self.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || "删除失败", icon: "none" });
          });
      }
    });
  }
});
