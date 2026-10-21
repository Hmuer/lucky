/**
 * 广告接入：底部 banner 由 components/ad-banner 组件负责，
 * 进入小程序时的插屏广告由这里统一创建与展示。
 * 广告位 ID 为空时静默跳过，不影响任何功能。
 */

const config = require("../config");

function units() {
  return config.AD_UNITS || {};
}

function bannerUnitId() {
  return String(units().banner || "");
}

function interstitialUnitId() {
  return String(units().interstitial || "");
}

let interstitial = null;
let launchShown = false;

function createInterstitial() {
  const unitId = interstitialUnitId();
  if (!unitId || interstitial) return interstitial;
  if (typeof wx === "undefined" || typeof wx.createInterstitialAd !== "function") return null;
  interstitial = wx.createInterstitialAd({ adUnitId: unitId });
  if (interstitial && typeof interstitial.onError === "function") {
    interstitial.onError(function () {
      // 广告拉取/展示失败不影响使用
    });
  }
  return interstitial;
}

/** 进入小程序后展示一次插屏广告（每个进程最多一次，失败静默） */
function showLaunchInterstitial() {
  if (launchShown) return;
  launchShown = true;
  if (!interstitialUnitId()) return;

  setTimeout(function () {
    const ad = createInterstitial();
    if (!ad || typeof ad.show !== "function") return;
    const result = ad.show();
    if (result && typeof result.catch === "function") {
      result.catch(function () {
        // 无广告填充或展示失败时忽略
      });
    }
  }, 1200);
}

module.exports = {
  bannerUnitId,
  interstitialUnitId,
  showLaunchInterstitial
};
