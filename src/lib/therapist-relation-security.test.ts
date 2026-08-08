/**
 * Security regression guard for direct Data API access to the five
 * therapist-owned relation tables.
 *
 * `anon` has no direct privileges at all; every public read of these tables
 * runs inside a trusted server function through the server-only privileged
 * client. Signed-in therapist owners keep exactly the operations the profile
 * editor performs (SELECT / INSERT / UPDATE / DELETE) on their own rows,
 * enforced by owner-scoped RLS keyed on
 * auth.uid() -> therapist_accounts.auth_user_id -> therapists.owner_account_id
 * -> relation.therapist_id.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const MIGRATIONS = join(SRC, "..", "supabase", "migrations");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const RELATION_TABLES = [
  "therapist_locations",
  "therapist_professions",
  "therapist_modalities",
  "therapist_languages",
  "therapist_populations",
] as const;

function relationLockdownMigration(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }))
    .find(({ sql }) =>
      /REVOKE ALL PRIVILEGES ON TABLE public\.therapist_populations FROM anon/i.test(sql),
    );
  expect(file, "relation-table lockdown migration must exist").toBeDefined();
  return file!.sql;
}

describe("therapist relation tables — lockdown migration", () => {
  const sql = relationLockdownMigration();

  it("is transactional and scoped to the five relation tables", () => {
    expect(sql).toMatch(/^\s*BEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
    for (const t of ["professions", "treatment_modalities", "languages", "population_groups"]) {
      // catalog tables must be untouched
      expect(new RegExp(`(REVOKE|GRANT|POLICY)[^;]*public\\.${t}\\b`, "i").test(sql)).toBe(false);
    }
    // no data mutation, no views, no RPCs
    expect(/\b(INSERT INTO|UPDATE\s+public\.|DELETE FROM|TRUNCATE)\b/i.test(sql)).toBe(false);
    expect(/CREATE (OR REPLACE )?(VIEW|FUNCTION)/i.test(sql)).toBe(false);
  });

  for (const t of RELATION_TABLES) {
    describe(t, () => {
      it("drops the unrestricted public read policy", () => {
        expect(sql).toContain(`DROP POLICY IF EXISTS "Public read ${t}" ON public.${t};`);
      });

      it("revokes every direct privilege from anon and never grants any back", () => {
        expect(sql).toMatch(
          new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon`, "i"),
        );
        expect(
          new RegExp(`GRANT[^;]*\\bON TABLE public\\.${t}\\b[^;]*TO anon`, "i").test(sql),
        ).toBe(false);
      });

      it("narrows authenticated to exactly the editor operations", () => {
        expect(sql).toMatch(
          new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM authenticated`, "i"),
        );
        expect(sql).toContain(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO authenticated;`,
        );
        // no TRUNCATE / REFERENCES / TRIGGER / ALL for authenticated
        expect(
          new RegExp(
            `GRANT[^;]*(ALL|TRUNCATE|REFERENCES|TRIGGER)[^;]*public\\.${t}[^;]*TO authenticated`,
            "i",
          ).test(sql),
        ).toBe(false);
      });

      it("keeps RLS enabled with an owner-scoped policy carrying USING and WITH CHECK", () => {
        expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
        expect(sql).toContain(`CREATE POLICY "Owner manage ${t}"`);
        const policy = sql.slice(sql.indexOf(`CREATE POLICY "Owner manage ${t}"`));
        const body = policy.slice(0, policy.indexOf(";"));
        expect(body).toMatch(/FOR ALL\s+TO authenticated/i);
        expect(body).toContain("USING (");
        expect(body).toContain("WITH CHECK (");
        // ownership chain, applied on both sides
        expect(body.match(/a\.auth_user_id = auth\.uid\(\)/g)?.length).toBe(2);
        expect(body.match(new RegExp(`t\\.id = ${t}\\.therapist_id`, "g"))?.length).toBe(2);
        expect(body.match(/a\.id = t\.owner_account_id/g)?.length).toBe(2);
      });

      it("preserves privileged server access", () => {
        expect(sql).toMatch(new RegExp(`GRANT ALL ON TABLE public\\.${t} TO service_role`, "i"));
      });
    });
  }
});

describe("therapist relation tables — server/client boundary", () => {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    const rec = (rel: string) => {
      for (const e of readdirSync(join(SRC, dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) rec(r);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(`${dir}/${r}`);
      }
    };
    rec("");
    return out;
  };

  it("no browser component or route queries a relation table with the anon client", () => {
    const offenders: string[] = [];
    for (const f of [...walk("components"), ...walk("routes")]) {
      const src = read(f);
      if (!src.includes('@/integrations/supabase/client"')) continue;
      for (const t of RELATION_TABLES) {
        if (src.includes(`from("${t}")`)) offenders.push(`${f}:${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("public relation reads live in server-function modules using the trusted client", () => {
    for (const f of [
      "lib/therapists.functions.ts",
      "lib/structured-search.functions.ts",
      "lib/query-interpreter.functions.ts",
    ]) {
      const src = read(f);
      expect(src.includes('await import("./trusted-read-client.server")'), f).toBe(true);
      expect(/^import .*trusted-read-client/m.test(src), f).toBe(false);
    }
  });

  it("the profile editor mutates relation tables only through the authenticated owner client", () => {
    const src = read("lib/therapist-profile.functions.ts");
    expect(src).toContain("requireSupabaseAuth");
    expect(src.includes("trusted-read-client"), "editor must not use the privileged client").toBe(
      false,
    );
    expect(src.includes("client.server")).toBe(false);
    // the editor performs delete + insert per relation table, and select on load
    for (const t of RELATION_TABLES) expect(src.includes(t), t).toBe(true);
    expect(statSync(join(SRC, "lib/therapist-profile.functions.ts")).size).toBeGreaterThan(0);
  });

  it("public DTOs expose no raw location columns", () => {
    const dto = read("lib/public-therapist-profile.ts");
    for (const col of ["address", "postal_code", "latitude", "longitude"]) {
      expect(dto.includes(`"${col}"`) && dto.includes("PUBLIC_THERAPIST_COLUMNS"), col).toBe(
        dto.slice(dto.indexOf("PUBLIC_THERAPIST_COLUMNS"), dto.indexOf("] as const")).includes(
          `"${col}"`,
        ),
      );
    }
    const publicList = dto.slice(
      dto.indexOf("PUBLIC_THERAPIST_COLUMNS"),
      dto.indexOf("] as const"),
    );
    for (const col of ["address", "postal_code", "latitude", "longitude", "region"]) {
      expect(publicList.includes(`"${col}"`), col).toBe(false);
    }
  });
});
