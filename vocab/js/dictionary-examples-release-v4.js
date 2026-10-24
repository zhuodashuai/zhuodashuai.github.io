// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/4191b9ceb5740892393f3a4c4124d1d403df4780fc4c932bf973736f55745e0b.bin",
    "codec": "gzip",
    "bytes": 7558,
    "sha256": "4191b9ceb5740892393f3a4c4124d1d403df4780fc4c932bf973736f55745e0b",
    "decodedBytes": 19019,
    "decodedSha256": "f3a13542925af395bca472af78c87273ca1421d55c8125690fff7fd3a9d6f106"
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
export const DICTIONARY_EXAMPLES_VERSION='f3b093679fa5dc08e6f0a39f0849d2b657216f4549033f9fc27c0a57eae66b68';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":87660,"examples":89049});
