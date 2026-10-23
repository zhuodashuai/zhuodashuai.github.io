// Activation pins selected from the actual normal additive build. Tests compare
// these exact values with the registered index, catalogue and audit bytes.
// Older imported module instances retain their immutable catalogue and deltas.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const dictionaryExamplesRelease=freeze({
  catalogue:{file:'catalogue-v4/d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f.bin',codec:'gzip',bytes:1660,
    sha256:'d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f',decodedBytes:4056,
    decodedSha256:'ace34696bc4c219181753da0b107bea2be86d93402c3efda107f6ff00f10664a'},
  base:{file:'manifest-v2.json',bytes:57577,sha256:'23846f67b86c43bcd3b5b2e8b36fcf93ef19c63f2ac28ce982e989b3a13557e9',
    version:'afff0148b5c2cf401feb1ef646bb61a3fc2bcefd984050b8a0609f711f47c3c4',counts:{heads:86415,examples:87804}},
  source:{version:'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',
    manifestSha256:'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f'}
});
export const DICTIONARY_EXAMPLES_VERSION='7bd4a42b01de66f193435a5facb22ee5d350a8d14e719244d8146f4abaa19cc6';
export const DICTIONARY_EXAMPLES_COUNTS=freeze({heads:86700,examples:88089});
