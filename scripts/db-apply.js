#!/usr/bin/env node
/**
 * Applies shared/supabase/schema.sql and every migration, in order, with psql.
 * All of the files are idempotent, so this is safe to re-run.
 *
 *   SUPABASE_DB_URL=postgres://... npm run db:apply
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL to the Postgres connection string of the target database.");
  process.exit(1);
}

const root = path.resolve(__dirname, "..", "shared", "supabase");
const migrations = fs
  .readdirSync(path.join(root, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => path.join(root, "migrations", name));

for (const file of [path.join(root, "schema.sql"), ...migrations]) {
  console.log(`Applying ${path.relative(root, file)}`);
  execFileSync("psql", [dbUrl, "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PGOPTIONS: "--client-min-messages=warning" },
  });
}
console.log("Database schema is up to date.");
