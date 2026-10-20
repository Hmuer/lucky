const api = require("./api");

function enableNotifications() {
  return api
    .getSubscribeConfig()
    .then(function (config) {
      if (!config || !config.templateId) {
        wx.showToast({ title: "暂未开放", icon: "none" });
        return false;
      }
      return new Promise(function (resolve) {
        wx.requestSubscribeMessage({
          tmplIds: [config.templateId],
          success: function (res) {
            const accepted = res[config.templateId] === "accept";
            api.reportSubscription(accepted).then(function () {
              wx.showToast({
                title: accepted ? "已开启提醒" : "已取消",
                icon: "none"
              });
              resolve(accepted);
            });
          },
          fail: function () {
            wx.showToast({ title: "操作未完成", icon: "none" });
            resolve(false);
          }
        });
      });
    })
    .catch(function (err) {
      wx.showToast({ title: (err && err.message) || "操作失败", icon: "none" });
      return false;
    });
}

module.exports = {
  enableNotifications
};
