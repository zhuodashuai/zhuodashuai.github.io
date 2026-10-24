// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/b23d099a9751fff0b497cd003af4009fad8dc3066569c901e3063e31865c3e6c.bin",
    "codec": "gzip",
    "bytes": 5069,
    "sha256": "b23d099a9751fff0b497cd003af4009fad8dc3066569c901e3063e31865c3e6c",
    "decodedBytes": 12626,
    "decodedSha256": "9b5d94b29e7fbcaf32c2e6024b18aeb96aba9eab99cfe14c594f1726e4405e3f"
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
export const DICTIONARY_EXAMPLES_VERSION='0f28d53999b926e24e4e0b6820234baaf743b44fd2563cfca1a506f333d28fd9';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":87262,"examples":88651});
