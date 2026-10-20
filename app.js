const config = require("./config");

App({
  globalData: {
    token: ""
  },

  onLaunch() {
    const token = wx.getStorageSync(config.TOKEN_KEY);
    if (token) {
      this.globalData.token = token;
    }
  }
});
