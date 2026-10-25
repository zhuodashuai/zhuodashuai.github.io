// Pins from the actual normal additive build; older immutable releases remain served.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  "catalogue": {
    "file": "catalogue-v4/1f73e2a2fb3a188b72ab47ffd2dee745f1b29f2d117810c197c1114baad12935.bin",
    "codec": "gzip",
    "bytes": 63709,
    "sha256": "1f73e2a2fb3a188b72ab47ffd2dee745f1b29f2d117810c197c1114baad12935",
    "decodedBytes": 201513,
    "decodedSha256": "8e475d66940b4a8fd907ba543fe7a7d36ea304579751c830ced9adfe60bb2f5a"
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
export const DICTIONARY_EXAMPLES_VERSION='261399cae9d5c39861f21cbd2c89381fbf9c39694ebe4e774fe0db8078a5ab70';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({"heads":98216,"examples":99605});
