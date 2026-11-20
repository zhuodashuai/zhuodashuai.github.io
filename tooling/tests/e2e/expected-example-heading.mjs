// Presentation-only reference for the public disclosure. Stored definitions,
// main meanings and saved-card h4 labels must continue to use their raw text.
export function expectedExampleHeadingMeaning(value) {
  const leadingWhitespace = value.match(/^\s*/u)[0].length;
  const start = value.slice(leadingWhitespace);
  const firstCodePoint = start.codePointAt(0);
  if (firstCodePoint >= 0x2460 && firstCodePoint <= 0x2473) {
    return start.slice(1).trimStart();
  }
  const numbered = /^([1-9]\d?)[.、]/u.exec(start);
  if (numbered && !/[0-9]/u.test(start.charAt(numbered[0].length))) {
    return start.slice(numbered[0].length).trimStart();
  }
  return value;
}
