import assert from "node:assert/strict";

const dictionaryCurrent = '          <button id="dictionary-more" type="button" class="quiet-button choice-more" aria-controls="dictionary-choices" hidden>查看更多</button>';
const dictionaryHistorical = '          <p id="dictionary-more" class="hint choice-more" hidden>候选较多，可换更具体的中文继续查。</p>';
const personalMore = '        <button type="button" id="member-dictionary-more" hidden disabled>查看更多</button>';
const personalStatus = '        <p id="member-dictionary-more-status" class="field-note" role="status" aria-live="polite"></p>';

// Undo only the two finite search-pagination HTML edits. Existing navigation,
// startup and provenance tests still compare every remaining byte to old pins.
export function restoreChineseSearchPaginationShell(file, text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (file === "dictionary.html") {
    const location = '          <ul id="dictionary-choices"></ul>' + eol + dictionaryCurrent + eol + "        </details>";
    assert.equal(text.split(dictionaryCurrent).length, 2, "Expected exactly the current pagination button");
    assert.equal(text.split(dictionaryHistorical).length, 1, "Historical hint must be replaced");
    assert.equal(text.split(location).length, 2, "Pagination button must stay directly after dictionary choices");
    return text.replace(dictionaryCurrent, dictionaryHistorical);
  }
  if (file === "personal.html") {
    const addition = personalMore + eol + personalStatus + eol;
    const location = '        <div id="member-dictionary-choices" class="dictionary-choices" hidden></div>' + eol
      + addition + '        <div id="member-dictionary-result"';
    assert.equal(text.split(personalMore).length, 2, "Expected exactly the personal pagination button");
    assert.equal(text.split(personalStatus).length, 2, "Expected exactly the personal pagination status");
    assert.equal(text.split(location).length, 2, "Personal pagination controls must stay between choices and result");
    return text.replace(addition, "");
  }
  return text;
}
