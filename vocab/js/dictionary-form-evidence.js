// One authenticated bad source relation, not a suffix/POS heuristic.
// COM names computer-output microfilm; comming is not its inflection.
// Preserve the raw licensed row, literal COM, and its declared plural coms.
const VERSION = "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644";
const RECORD_JSON = "{\"id\":3775454,\"term\":\"COM\",\"partOfSpeech\":\"noun\",\"meaning\":\"[计] 计算机输出缩微胶片; 计算机输出胶片缩微机\",\"forms\":[\"comming\",\"coms\"],\"source\":\"pos-reviewed\",\"seed\":{\"rank\":29502,\"forms\":[\"comming\",\"coms\"],\"workbook\":false},\"variants\":[{\"partOfSpeech\":\"\",\"meaning\":\"[计] 计算机输出缩微胶片; 计算机输出胶片缩微机\",\"source\":\"mit\"}]}";
export function rejectsReviewedDictionaryForm(record, manifestVersion, form) {
  return form === "comming" && manifestVersion === VERSION && record?.id === 3775454
    && record.term === "COM" && JSON.stringify(record) === RECORD_JSON;
}
