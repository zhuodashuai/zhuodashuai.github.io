// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/377d80ccbe67306dd2067c26d12a3172fd601ade7603bec722e19405bd232098.bin",
    "codec": "gzip",
    "bytes": 40900,
    "sha256": "377d80ccbe67306dd2067c26d12a3172fd601ade7603bec722e19405bd232098",
    "decodedBytes": 122747,
    "decodedSha256": "3504e50893de924bb50f9a590719befee63da5e1de39babd50b328bd82bdc14d"
  },
  "base": {
    "file": "manifest-v2.json",
    "bytes": 57577,
    "sha256": "23846f67b86c43bcd3b5b2e8b36fcf93ef19c63f2ac28ce982e989b3a13557e9",
    "version": "afff0148b5c2cf401feb1ef646bb61a3fc2bcefd984050b8a0609f711f47c3c4",
    "counts": {
      "heads": 86415,
      "examples": 87804
    }
  },
  "source": {
    "version": "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644",
    "manifestSha256": "2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f"
  }
});
export const DICTIONARY_EXAMPLES_VERSION='2882b134b5094d76e6d1eb52642fa7393e1aad4e238f83eca22b284b9a1e025a';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":93216,"examples":94605});
