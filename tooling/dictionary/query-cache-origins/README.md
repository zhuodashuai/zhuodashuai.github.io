This directory holds compiler inputs, not a runtime query source.

`registry.json` names exactly the original 941 release. The archived module is
stored byte for byte, protected by the local `* -text` attribute and a fixed
SHA-256/length in the compiler. It is parsed as JSON inside its exact generated
wrapper; it is never evaluated. The compiler separately hashes and checks all
64 original buckets and every original gzip bundle before considering reuse.

Phase 1 does not change Pages packaging. Before publishing the schema-2 release,
the packaging configuration and its verifier/test must explicitly exclude this
authoring prefix. Until that separate change is made, this directory would be
copied to `_site`; its source-only intent is not an existing exclusion.

No old runtime asset is removed. Full current ordinary and related-source replay,
the final namespace-125 module graph, actual full-corpus/browser/offline checks,
capacity measurement and independent release review remain separate gates.
