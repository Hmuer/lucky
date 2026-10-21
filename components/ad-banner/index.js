const ad = require("../../utils/ad");

Component({
  data: {
    unitId: ad.bannerUnitId()
  },

  methods: {
    onError() {
      // 广告拉取失败时保持静默，不影响页面布局
    }
  }
});
