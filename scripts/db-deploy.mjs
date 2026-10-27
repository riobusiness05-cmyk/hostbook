#!/usr/bin/env node
// Production schema deploy: Prisma migrations, never `db push`.
//
// First run against a database that predates migrations: mark the baseline
// (0_init, generated from the schema the database already matched) as
// applied without running it, then apply anything newer. Every later run:
// the baseline is already recorded, so only new migrations apply. A
// destructive or failing migration fails the build — the previous
// deployment stays live and no data is touched.
import { spawnSync } from "node:child_process";

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", env: process.env });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out);
  if (r.status !== 0 && !allowFail) {
    console.error(`\n[db-deploy] "${cmd} ${args.join(" ")}" failed with exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
  return { status: r.status, out };
}

const base = run("npx", ["prisma", "migrate", "resolve", "--applied", "0_init"], { allowFail: true });
if (base.status !== 0) {
  // P3008 = already recorded as applied — the normal case after the first deploy.
  if (/P3008|already recorded|is already applied/i.test(base.out)) {
    console.log("[db-deploy] baseline already recorded.");
  } else {
    console.error("[db-deploy] could not record the baseline — refusing to continue.");
    process.exit(1);
  }
}
run("npx", ["prisma", "migrate", "deploy"]);
console.log("[db-deploy] schema is up to date.");
