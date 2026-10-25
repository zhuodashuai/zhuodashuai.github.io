// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/0174f066dfd51f3827b8530ab61abb19038e03eff8e0a71a483e0973b886269c.bin",
    "codec": "gzip",
    "bytes": 10916,
    "sha256": "0174f066dfd51f3827b8530ab61abb19038e03eff8e0a71a483e0973b886269c",
    "decodedBytes": 28737,
    "decodedSha256": "2b21497322bacf1c70f2163165fa791f35414521233bf464f023eaff568943f7"
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
export const DICTIONARY_EXAMPLES_VERSION='acd4a8f999f81b1981937df3b68154506aa5b2d5799d963c2f1724074781341c';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":88216,"examples":89605});
