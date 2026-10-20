const config = require("../config");

function getToken() {
  return wx.getStorageSync(config.TOKEN_KEY) || "";
}

function setToken(token) {
  wx.setStorageSync(config.TOKEN_KEY, token);
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = token;
  }
}

function clearToken() {
  wx.removeStorageSync(config.TOKEN_KEY);
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = "";
  }
}

function ensureLogin() {
  if (getToken()) return true;
  wx.reLaunch({ url: "/pages/login/index" });
  return false;
}

module.exports = {
  getToken,
  setToken,
  clearToken,
  ensureLogin
};
