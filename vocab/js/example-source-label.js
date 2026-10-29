// Presentation only: retain the exact stored source and review evidence.
export function learningExampleSourceLabel(source) {
  return source === "原创例句·AI复核（精选义项）"
    || source === "原创例句·作者自查（精选义项）"
    ? "原创学习例句" : source;
}
