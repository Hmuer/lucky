function two(value) {
  return String(value).padStart(2, "0");
}

function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function changeText(cents) {
  const value = Number(cents || 0);
  const text = (value / 100).toFixed(2);
  return value > 0 ? "+" + text : text;
}

function changeClass(cents) {
  const value = Number(cents || 0);
  if (value > 0) return "change-up";
  if (value < 0) return "change-down";
  return "";
}

function numbersText(numbers) {
  return (numbers || []).map(two).join(" ");
}

module.exports = {
  two,
  centsToYuan,
  changeText,
  changeClass,
  numbersText
};
