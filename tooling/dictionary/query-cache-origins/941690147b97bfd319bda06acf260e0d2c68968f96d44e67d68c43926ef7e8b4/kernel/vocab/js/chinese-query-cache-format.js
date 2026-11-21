// The packet key is only the public whole-input spelling, never a synonym or
// a grammatical stem. In particular, interior spaces and negation survive.
export function normalizeChineseQueryCacheQuery(input) {
  if (typeof input !== 'string' || input.length > 200
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(input)) return null;
  const query = input.normalize('NFKC').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US')
    .replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, '').trim();
  return query && [...query].length <= 50 && /\p{Script=Han}/u.test(query)
    && !/[<>]|javascript\s*:/iu.test(query) ? query : null;
}

export function chineseQueryCacheBucket(query) {
  let hash = 2166136261;
  for (const character of query) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 64;
}
