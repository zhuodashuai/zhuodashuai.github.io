# Selected example components

This separate example-only lane contains exactly eight language-reviewed roles. It does not change canonical records, add heads or aliases, replace old examples, or approve complete raw dictionary definitions. The existing `canonical-same-sense-example-only-v1` replacement lane is unchanged.

`source.json` and `language-review.json` preserve the exact independent v2 language source and review. The compiler pins the source semantic hash and review byte hash. `bindings.json` binds each complete original canonical record, descriptor, original DTO and its new five-field pair. `admission.json` records the parent task's explicit finite display policy; it is not a historical author identity or independent implementation-review certificate. Root's independent implementation review remains pending before any future release.

This input bundle uses the repository's existing LF-protected evidence subtree. Historical attributes remain exact. The new public generated JS permits only exact LF or exact whole-file CRLF checkout transport during its own freshness check; mixed line endings and changed source fail. This does not change any historical byte assertion or source hash.

Each admission row binds the canonical ID/hash, complete original DTO hash, selected pair hash, and three finite context lists. The compiler derives those lists again and requires exact equality:

- Literal unscoped lookup and exact raw/formatted canonical contexts return all old senses unchanged, followed by one separately labelled new component.
- Exact old selected POS/meaning contexts return the entire original DTO only.
- Exact new component POS/meaning contexts return that component only.
- Unrelated, aliased or mutated contexts and caller flags grant no component.

Every compiled row retains `wholeRawSourceApproved: false` and its source qualification note. A component ID hashes the canonical ID, full canonical source hash and exact five-field pair hash. Existing sense IDs, ordering, metadata and examples remain unchanged. The resolver uses the immutable original loader directly, avoiding adapter recursion, and authenticates canonical bytes through the existing source client.

Original DTO authentication runs independently of the optional canonical-source wait. Old-selected contexts need no optional source request; source failure or deadline retains an already authenticated, unchanged original DTO for other approved old/canonical contexts. New-only contexts receive no old fallback. When both new assets are absent, exact old-selected contexts can still use authenticated original senses; canonical raw/formatted fallback additionally requires the genuine existing release pins and the shared reader's exact literal primary record. Missing, mismatched or unavailable genuine source remains closed. The added `readLiteral` source API shares the existing authenticated extraction; the replacement API is unchanged.

Generate only this lane with `node tooling/scripts/build-canonical-example-components.mjs`; verify determinism with `--check`. No ordinary dictionary/example compiler is run by this builder. Its duplicate inventory reads current base/delta and selected/correction/repair/everyday public data and checks both normalized English and Chinese. This is a separate local branch, not part of PR82 or a published release.
