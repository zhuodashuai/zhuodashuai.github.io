import { DatabaseSync } from "node:sqlite";
import { searchOriginalDatabase } from "../lib/original-dictionary-exports.mjs";

const arg = key => process.argv.slice(2).find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
let database;
try {
  const path = arg("--db");
  const query = arg("--query");
  if (!path || !query) throw new Error("Use --db=<local sqlite path> --query=<English>. Add --draft only to inspect unreviewed original writing locally.");
  database = new DatabaseSync(path, { readOnly: true });
  const result = searchOriginalDatabase(database, query, { includeDrafts: process.argv.includes("--draft") });
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { database?.close(); }
