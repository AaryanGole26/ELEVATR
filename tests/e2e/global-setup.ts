import { execFileSync, execSync } from "child_process";
import path from "path";

/** Applies the schema and clears data left by earlier runs. Refuses anything but the local database. */
export default function globalSetup() {
  const status = JSON.parse(execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const dbUrl: string = status.DB_URL;
  if (!/@(127\.0\.0\.1|localhost):/.test(dbUrl)) {
    throw new Error("End-to-end tests only run against a local Supabase database.");
  }

  execFileSync("node", [path.join(__dirname, "..", "..", "scripts", "db-apply.js")], {
    stdio: "ignore",
    env: { ...process.env, SUPABASE_DB_URL: dbUrl }
  });
  execFileSync("psql", [dbUrl, "-q", "-v", "ON_ERROR_STOP=1", "-c", "delete from auth.users; delete from public.resumes;"], {
    stdio: "ignore",
    env: { ...process.env, PGOPTIONS: "--client-min-messages=warning" }
  });
}
