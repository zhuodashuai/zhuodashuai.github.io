// Finite authenticated bad source relations, never suffix/POS heuristics.
// COM names computer-output microfilm; comming is not its inflection.
// Preserve the raw licensed row, literal COM, and its declared plural coms.
const VERSION = "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644";
const RECORD_JSON = "{\"id\":3775454,\"term\":\"COM\",\"partOfSpeech\":\"noun\",\"meaning\":\"[计] 计算机输出缩微胶片; 计算机输出胶片缩微机\",\"forms\":[\"comming\",\"coms\"],\"source\":\"pos-reviewed\",\"seed\":{\"rank\":29502,\"forms\":[\"comming\",\"coms\"],\"workbook\":false},\"variants\":[{\"partOfSpeech\":\"\",\"meaning\":\"[计] 计算机输出缩微胶片; 计算机输出胶片缩微机\",\"source\":\"mit\"}]}";
// UK resit (an exam) uses resat/resitting; resited/resiting can belong
// to a different verb resite and must never be rejected as literal strings.
const RESIT_RECORD_JSON = "{\"id\":5264684,\"term\":\"resit\",\"partOfSpeech\":\"verb\",\"meaning\":\"<英> vt.(尤指考试不及格后)再参加(考试)\\nvi.(考试不及格后)再考,重考\",\"forms\":[\"resited\",\"resiting\",\"resits\"],\"source\":\"mit\",\"seed\":{\"rank\":41148,\"forms\":[\"resited\",\"resiting\",\"resits\"],\"workbook\":true}}";
const NONE = Object.freeze([]);
const COM_BAD_FORMS = Object.freeze(["comming"]);
const RESIT_BAD_FORMS = Object.freeze(["resited", "resiting"]);

/** Called only on the original JSON row after the private parser verifies the
 * complete current shard. The returned set describes relations, not words. */
export function rejectedReviewedDictionaryForms(record, manifestVersion) {
  if (manifestVersion !== VERSION) return NONE;
  if (record?.id === 3775454 && record.term === "COM" && JSON.stringify(record) === RECORD_JSON) return COM_BAD_FORMS;
  if (record?.id === 5264684 && record.term === "resit" && JSON.stringify(record) === RESIT_RECORD_JSON) return RESIT_BAD_FORMS;
  return NONE;
}

// Compatibility for existing readers of the original exact COM policy.
export function rejectsReviewedDictionaryForm(record, manifestVersion, form) {
  return rejectedReviewedDictionaryForms(record, manifestVersion).includes(form);
}
