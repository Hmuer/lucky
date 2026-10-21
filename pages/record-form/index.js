const api = require("../../utils/api");
const auth = require("../../utils/auth");
const mapper = require("../../utils/mapper");
const validate = require("../../utils/validate");
const count = require("../../utils/count");

function range(size) {
  const list = [];
  for (let i = 1; i <= size; i++) list.push(i);
  return list;
}

const MAIN_NUMBERS = range(33);
const SPECIAL_NUMBERS = range(16);

Page({
  data: {
    type: "single",
    typeOptions: [
      { key: "single", label: "基础", desc: "6 个主数字 + 1 个特别数字" },
      { key: "complex", label: "组合", desc: "6~20 个主数字 + 1~16 个特别数字" },
      { key: "danTuo", label: "核心组合", desc: "1~5 个核心数字 + 扩展数字 + 1~16 个特别数字" }
    ],
    typeDesc: "6 个主数字 + 1 个特别数字",
    main: [],
    special: [],
    core: [],
    extra: [],
    mainCells: [],
    specialCells: [],
    coreCells: [],
    extraCells: [],
    specialLimit: 1,
    specialAll: false,
    specialTip: "基础组合需要 1 个特别数字，点选即替换",
    units: 0,
    unitsText: "0 组",
    amountText: "0.00",
    name: "",
    unitValue: "2.00",
    eachTime: true,
    enabled: true,
    startMode: "next",
    startCode: "",
    editingId: 0,
    saving: false
  },

  onLoad(options) {
    const id = Number(options.id || 0);
    this.editingId = id;
    this.setData({ editingId: id }, () => {
      this.render();
      if (id) {
        wx.setNavigationBarTitle({ title: "编辑组合" });
        this.loadForEdit(id);
      } else {
        wx.setNavigationBarTitle({ title: "新增组合" });
      }
    });
  },

  render() {
    const type = this.data.type;
    const main = this.data.main;
    const special = this.data.special;
    const core = this.data.core;
    const extra = this.data.extra;
    const specialLimit = type === "single" ? 1 : SPECIAL_NUMBERS.length;
    const units = count.unitsOf(type, {
      red: main,
      redDan: core,
      redTuo: extra,
      blue: special
    });
    const price = Number(this.data.unitValue);
    const amount = units * (isFinite(price) && price > 0 ? price : 0);
    const tips = {
      single: "基础组合需要 1 个特别数字，点选即替换",
      complex: "特别数字可单选、多选，也可一键全选",
      danTuo: "特别数字可单选、多选，也可一键全选"
    };

    this.setData({
      mainCells: MAIN_NUMBERS.map((n) => ({ n, active: main.indexOf(n) >= 0 })),
      specialCells: SPECIAL_NUMBERS.map((n) => ({ n, active: special.indexOf(n) >= 0 })),
      coreCells: MAIN_NUMBERS.map((n) => ({ n, active: core.indexOf(n) >= 0 })),
      extraCells: MAIN_NUMBERS.map((n) => ({
        n,
        active: extra.indexOf(n) >= 0,
        disabled: core.indexOf(n) >= 0
      })),
      specialLimit: specialLimit,
      specialAll: specialLimit > 1 && special.length === SPECIAL_NUMBERS.length,
      specialTip: tips[type] || tips.single,
      units: units,
      unitsText: units + " 组",
      amountText: amount.toFixed(2)
    });
  },

  loadForEdit(id) {
    api
      .getRecords()
      .then((data) => {
        const row = (data.bets || []).find((item) => Number(item.id) === id);
        if (!row) throw new Error("组合不存在");
        const form = mapper.mapRecordToForm(mapper.mapRecord(row));
        this.setData(
          {
            id: form.id,
            type: form.type,
            typeDesc: mapper.typeDescription(form.type),
            name: form.name,
            main: form.main,
            special: form.special,
            core: form.core,
            extra: form.extra,
            unitValue: form.unitValue,
            eachTime: form.eachTime,
            enabled: form.enabled,
            startMode: form.startMode,
            startCode: form.startCode
          },
          () => this.render()
        );
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  onType(event) {
    const type = event.currentTarget.dataset.type;
    this.setData(
      {
        type,
        typeDesc: mapper.typeDescription(type),
        main: [],
        special: [],
        core: [],
        extra: []
      },
      () => this.render()
    );
  },

  toggleMain(event) {
    const n = Number(event.currentTarget.dataset.n);
    const list = this.data.main.slice();
    const index = list.indexOf(n);
    if (index >= 0) {
      list.splice(index, 1);
    } else if (this.data.type === "single" && list.length >= 6) {
      wx.showToast({ title: "基础组合需要 6 个主数字", icon: "none" });
      return;
    } else if (this.data.type === "complex" && list.length >= 20) {
      wx.showToast({ title: "最多选择 20 个主数字", icon: "none" });
      return;
    } else {
      list.push(n);
      list.sort((a, b) => a - b);
    }
    this.setData({ main: list }, () => this.render());
  },

  toggleSpecial(event) {
    const n = Number(event.currentTarget.dataset.n);
    const list = this.data.special.slice();
    const index = list.indexOf(n);

    // 基础组合只允许 1 个特别数字：点选即替换
    if (this.data.type === "single") {
      this.setData({ special: index >= 0 ? [] : [n] }, () => this.render());
      return;
    }

    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(n);
      list.sort((a, b) => a - b);
    }
    this.setData({ special: list }, () => this.render());
  },

  selectAllSpecial() {
    if (this.data.specialLimit <= 1) return;
    const all = this.data.special.length === SPECIAL_NUMBERS.length;
    this.setData({ special: all ? [] : SPECIAL_NUMBERS.slice() }, () => this.render());
  },

  clearSpecial() {
    if (!this.data.special.length) return;
    this.setData({ special: [] }, () => this.render());
  },

  toggleCore(event) {
    const n = Number(event.currentTarget.dataset.n);
    const list = this.data.core.slice();
    const index = list.indexOf(n);
    if (index >= 0) {
      list.splice(index, 1);
    } else if (list.length >= 5) {
      wx.showToast({ title: "最多选择 5 个核心数字", icon: "none" });
      return;
    } else {
      list.push(n);
      list.sort((a, b) => a - b);
    }
    const extra = this.data.extra.filter((item) => item !== n);
    this.setData({ core: list, extra }, () => this.render());
  },

  toggleExtra(event) {
    const n = Number(event.currentTarget.dataset.n);
    if (this.data.core.indexOf(n) >= 0) {
      wx.showToast({ title: "该数字已设为核心数字", icon: "none" });
      return;
    }
    const list = this.data.extra.slice();
    const index = list.indexOf(n);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(n);
      list.sort((a, b) => a - b);
    }
    this.setData({ extra: list }, () => this.render());
  },

  onName(event) {
    this.setData({ name: event.detail.value });
  },

  onUnit(event) {
    this.setData({ unitValue: event.detail.value }, () => this.render());
  },

  onStartCode(event) {
    this.setData({ startCode: event.detail.value });
  },

  setStartMode(event) {
    this.setData({ startMode: event.currentTarget.dataset.mode });
  },

  onEachTime(event) {
    this.setData({ eachTime: event.detail.value });
  },

  onEnabled(event) {
    this.setData({ enabled: event.detail.value });
  },

  save() {
    if (this.data.saving) return;
    const form = {
      name: this.data.name,
      type: this.data.type,
      main: this.data.type === "danTuo" ? [] : this.data.main,
      special: this.data.special,
      core: this.data.type === "danTuo" ? this.data.core : [],
      extra: this.data.type === "danTuo" ? this.data.extra : [],
      unitValue: this.data.unitValue,
      eachTime: this.data.eachTime,
      enabled: this.data.enabled,
      startMode: this.data.startMode,
      startCode: this.data.startCode
    };

    const error = validate.validateForm(form);
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }

    const payload = mapper.toCreatePayload(form);
    const request = this.data.editingId
      ? api.updateRecord(this.data.editingId, payload)
      : api.createRecord(payload);

    this.setData({ saving: true });
    request
      .then(() => {
        wx.showToast({ title: "已保存", icon: "none" });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || "保存失败", icon: "none" });
      })
      .then(() => {
        this.setData({ saving: false });
      });
  }
});
