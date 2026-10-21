let memoryToken = "";

function getToken() {
  return memoryToken;
}

function setToken(token) {
  memoryToken = token || "";
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = memoryToken;
  }
}

function clearToken() {
  memoryToken = "";
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
