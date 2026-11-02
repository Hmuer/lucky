const RANGES = {
  main: [1, 33],
  special: [1, 16]
};

function unique(list) {
  return Array.from(new Set((list || []).map(Number)));
}

function inRange(list, min, max) {
  return (list || []).every(function (n) {
    return Number.isInteger(n) && n >= min && n <= max;
  });
}

function validateForm(form) {
  const name = String(form.name || "").trim();
  if (!name) return "请填写名称";
  if (!form.type) return "请选择类型";

  const unit = Number(form.unitValue);
  if (!(unit > 0)) return "记录值需大于 0";
  if (unit > 100000) return "记录值过大";

  const main = unique(form.main);
  const special = unique(Array.isArray(form.special) ? form.special : form.special ? [form.special] : []);
  const core = unique(form.core);
  const extra = unique(form.extra);

  if (form.type === "single") {
    if (main.length !== 6) return "基础组合需要 6 个主数字";
    if (special.length !== 1) return "基础组合需要 1 个特别数字";
  } else if (form.type === "complex") {
    if (main.length < 6 || main.length > 20) return "组合需要 6~20 个主数字";
    if (special.length < 1) return "请至少选择 1 个特别数字";
    if (special.length > 16) return "特别数字最多 16 个";
  } else if (form.type === "danTuo") {
    if (core.length < 1 || core.length > 5) return "核心数字需要 1~5 个";
    const need = 6 - core.length;
    if (extra.length < need) return "扩展数字至少需要 " + need + " 个";
    if (extra.length > 29) return "扩展数字过多";
    const overlap = core.some(function (n) {
      return extra.indexOf(n) >= 0;
    });
    if (overlap) return "核心数字和扩展数字不能重复";
    if (special.length < 1) return "请至少选择 1 个特别数字";
    if (special.length > 16) return "特别数字最多 16 个";
  } else {
    return "类型错误";
  }

  if (!inRange(main, RANGES.main[0], RANGES.main[1])) return "主数字超出范围";
  if (!inRange(core, RANGES.main[0], RANGES.main[1])) return "核心数字超出范围";
  if (!inRange(extra, RANGES.main[0], RANGES.main[1])) return "扩展数字超出范围";
  if (!inRange(special, RANGES.special[0], RANGES.special[1])) return "特别数字超出范围";

  if (form.startMode === "custom" && !/^\d{7}$/.test(String(form.startCode || ""))) {
    return "起始编号需为 7 位数字";
  }

  return "";
}

module.exports = {
  validateForm,
  unique
};
