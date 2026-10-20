const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");

Page({
  data: {
    loading: true,
    items: [],
    error: ""
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .getHistory()
      .then((data) => {
        this.setData({
          items: mapper.mapHistory(data),
          loading: false
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || "加载失败"
        });
      });
  }
});
