import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";

const target = resolve("vocab/data/owner-wordbook.json");
const legacy = JSON.parse(await readFile(target, "utf8"));
const migrated = parsePublicSnapshot(legacy);
migrated.exportedAt = new Date().toISOString();
migrated.revisionId = "migration-v3-2026-08-28";
migrated.lastMutationId = "";
const verified = parsePublicSnapshot(migrated, { allowLegacy: false });
await writeFile(target, `${JSON.stringify(verified, null, 2)}\n`, "utf8");
console.log(`Migrated ${verified.entries.length} public entries to schema v${verified.schemaVersion}.`);
