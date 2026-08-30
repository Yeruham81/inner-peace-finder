/**
 * Security regression guard for direct Data API access to public.therapists.
 *
 * The permissions migration removes every `anon` privilege on the base
 * table, so public reads MUST run inside trusted server functions through
 * the server-only trusted read client. These tests pin both halves of that
 * arrangement: the SQL that grants it, and the module boundary that keeps
 * the privileged client out of the browser bundle.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const MIGRATIONS = join(SRC, "..", "supabase", "migrations");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function lockdownMigration(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }))
    .find(({ sql }) => /REVOKE ALL PRIVILEGES ON TABLE public\.therapists FROM anon/i.test(sql));
  expect(file, "therapists lockdown migration must exist").toBeDefined();
  return file!.sql;
}

describe("therapists table lockdown — migration", () => {
  const sql = lockdownMigration();

  it("drops the broad public read policy", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Public read therapists"');
  });

  it("revokes every direct privilege from anon", () => {
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.therapists FROM anon/i);
    // and never grants anything back to anon
    expect(/GRANT[^;]*\bON TABLE public\.therapists\b[^;]*TO anon/i.test(sql)).toBe(false);
  });

  it("narrows authenticated privileges to the owner-editor flow (no DELETE)", () => {
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.therapists FROM authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.therapists TO authenticated/i);
    expect(/GRANT[^;]*DELETE[^;]*public\.therapists[^;]*TO authenticated/i.test(sql)).toBe(false);
  });

  it("creates an owner-scoped SELECT policy keyed on the real ownership column", () => {
    expect(sql).toContain('CREATE POLICY "Owner can read own therapist row"');
    expect(sql).toContain("owner_account_id");
    expect(sql).toContain("a.auth_user_id = auth.uid()");
    expect(sql).toMatch(/FOR SELECT\s+TO authenticated/i);
  });

  it("preserves privileged server access", () => {
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.therapists TO service_role/i);
  });

  it("creates no public view or public RPC in this phase", () => {
    expect(/CREATE (OR REPLACE )?VIEW/i.test(sql)).toBe(false);
    expect(/SECURITY DEFINER/i.test(sql)).toBe(false);
  });
});

describe("therapists table lockdown — server/client boundary", () => {
  it("the trusted read client lives in a server-only module", () => {
    const src = read("lib/trusted-read-client.server.ts");
    expect(src).toContain("client.server");
  });

  it("no client component or route statically imports the privileged clients", () => {
    const files = [
      ...readdirSync(join(SRC, "components")).map((f) => `components/${f}`),
      ...readdirSync(join(SRC, "routes")).map((f) => `routes/${f}`),
    ].filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
    for (const f of files) {
      const src = read(f);
      expect(src.includes("client.server"), f).toBe(false);
      expect(src.includes("trusted-read-client"), f).toBe(false);
      expect(src.includes("SERVICE_ROLE"), f).toBe(false);
    }
  });

  it("server-function modules load the trusted client dynamically, never at module scope", () => {
    for (const f of [
      "lib/therapists.functions.ts",
      "lib/query-interpreter.functions.ts",
      "lib/query-catalog.ts",
      "lib/profile-claim-v2.functions.ts",
    ]) {
      const src = read(f);
      if (!src.includes("trusted-read-client")) continue;
      expect(/^import .*trusted-read-client/m.test(src), f).toBe(false);
      expect(src.includes('await import("./trusted-read-client.server")'), f).toBe(true);
    }
  });

  it("public therapist reads no longer rely on the anon publishable key", () => {
    for (const f of ["lib/therapists.functions.ts", "lib/query-interpreter.functions.ts", "lib/query-catalog.ts"]) {
      expect(read(f).includes("SUPABASE_PUBLISHABLE_KEY"), f).toBe(false);
    }
  });

  it("the service-role secret is never referenced outside server-only modules", () => {
    const offenders: string[] = [];
    const walk = (dir: string, rel = "") => {
      for (const e of readdirSync(join(SRC, dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(dir, r);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
          const p = `${dir}/${r}`;
          if (read(p).includes("SUPABASE_SERVICE_ROLE_KEY") && !p.includes(".server.")) {
            offenders.push(p);
          }
        }
      }
    };
    walk("lib");
    walk("components");
    walk("routes");
    expect(offenders).toEqual([]);
  });
});
