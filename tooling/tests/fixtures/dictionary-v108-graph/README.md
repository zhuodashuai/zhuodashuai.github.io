# Historical application graph

`f5ec5db-programs.json.gz` contains 17 exact UTF-8 Git blobs from commit
`f5ec5db6b21663b1e5f97217069bb08590d7f667`, before Chinese search ranking and
pagination changed the current application. `manifest.json` records each
repository filename, Git blob ID, byte count, and SHA-256.

The mechanical v108/v109 transition tests retain their original byte/hash pins
and compare these historical programs. The archive has a separate fixed hash
in `helpers/historical-v108-programs.mjs`; a changed fixture cannot silently
approve a different historical body. It uses gzip only to avoid checking in
multiple large copies of nearly identical JavaScript.

To reproduce a source item, read
`git show f5ec5db6b21663b1e5f97217069bb08590d7f667:vocab/js/<filename>` as bytes.
No line-ending conversion is used inside the archive. Current search,
pagination, cancellation, selection, and collection behavior are tested in
`vocab/tests/dictionary-page.test.mjs`,
`vocab/tests/library-lookup-controller.test.mjs`, and the current browser tests.
