// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/ac68127f2946c4803173e177718fad8082cc6f2a005b44da5b2f8fcbe4a24927.bin",
    "codec": "gzip",
    "bytes": 86538,
    "sha256": "ac68127f2946c4803173e177718fad8082cc6f2a005b44da5b2f8fcbe4a24927",
    "decodedBytes": 282340,
    "decodedSha256": "40578601275b2cbb18c0df24befc5d4c627de145a9c8559a48d10ae9b60b89d9"
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
export const DICTIONARY_EXAMPLES_VERSION='7a23a613ebc8e97b4c4eddac2a9a34760113cf9da5a011d680cb33d04a2092fb';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":102609,"examples":103998});
