const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    loading: false
  },

  onShow() {
    if (auth.getToken()) {
      wx.reLaunch({ url: "/pages/home/index" });
    }
  },

  start() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false });
          wx.showToast({ title: "登录失败", icon: "none" });
          return;
        }
        api
          .login(res.code)
          .then((data) => {
            auth.setToken(data.token);
            wx.reLaunch({ url: "/pages/home/index" });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || "登录失败", icon: "none" });
          })
          .then(() => {
            this.setData({ loading: false });
          });
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: "登录失败", icon: "none" });
      }
    });
  }
});
