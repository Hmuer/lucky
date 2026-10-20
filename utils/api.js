const config = require("../config");
const auth = require("./auth");

function request(path, method, data) {
  const token = auth.getToken();
  return new Promise(function (resolve, reject) {
    wx.request({
      url: config.API_BASE + path,
      method: method || "GET",
      data: data || {},
      timeout: 15000,
      header: Object.assign(
        { "content-type": "application/json" },
        token ? { Authorization: "Bearer " + token } : {}
      ),
      success: function (res) {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 40100) {
          auth.clearToken();
          wx.reLaunch({ url: "/pages/login/index" });
          reject({ code: 40100, message: "未登录" });
          return;
        }
        if (body.code !== 0) {
          reject({ code: body.code, message: body.message || "请求失败" });
          return;
        }
        resolve(body.data);
      },
      fail: function () {
        reject({ code: -1, message: "网络异常，请稍后重试" });
      }
    });
  });
}

function login(code) {
  return request("/login", "POST", { code: code });
}

function getLatest() {
  return request("/current", "GET");
}

function getRecords() {
  return request("/bets", "GET");
}

function createRecord(data) {
  return request("/bets", "POST", data);
}

function updateRecord(id, data) {
  return request("/bets/" + id, "PUT", data);
}

function deleteRecord(id) {
  return request("/bets/" + id, "DELETE");
}

function getHistory() {
  return request("/history", "GET");
}

function getStats() {
  return request("/stats", "GET");
}

function sync() {
  return request("/sync", "POST", {});
}

function getSubscribeConfig() {
  return request("/subscribe-config", "GET");
}

function reportSubscription(accepted) {
  return request("/report-subscription", "POST", { accepted: !!accepted });
}

module.exports = {
  login,
  getLatest,
  getRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  getHistory,
  getStats,
  sync,
  getSubscribeConfig,
  reportSubscription
};
