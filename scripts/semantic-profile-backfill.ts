/**
 * Server-only CLI for the one-time legacy semantic_profile backfill.
 *
 *   Dry run (default, zero writes):
 *     bun run scripts/semantic-profile-backfill.ts
 *
 *   Apply (only after review/approval):
 *     SEMANTIC_PROFILE_BACKFILL_CONFIRM=legacy-published-semantic-profiles \
 *     SEMANTIC_PROFILE_BACKFILL_EXPECTED_COUNT=<reviewed count> \
 *     bun run scripts/semantic-profile-backfill.ts --apply
 *
 * Requires the managed service-role environment. Never prints secrets or
 * profile descriptions.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { runSemanticProfileBackfill } from "../src/lib/semantic-profile-backfill";

const url = process.env["SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !serviceRoleKey) {
  console.error(
    "BLOCKED: service-role environment unavailable (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Not falling back to the publishable key.",
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const expectedRaw = process.env["SEMANTIC_PROFILE_BACKFILL_EXPECTED_COUNT"];

const sb = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseClient<Database>;

const summary = await runSemanticProfileBackfill(sb, {
  apply,
  confirmToken: process.env["SEMANTIC_PROFILE_BACKFILL_CONFIRM"],
  expectedCount: expectedRaw === undefined ? undefined : Number(expectedRaw),
});

console.log(`mode: ${summary.mode}`);
for (const row of summary.rows) {
  if (row.outcome === "skipped_non_legacy") continue;
  console.log("---");
  console.log(`id:       ${row.id}`);
  console.log(`slug:     ${row.slug}`);
  console.log(`name:     ${row.full_name}`);
  console.log(`old:      ${JSON.stringify(row.old)}`);
  console.log(`new:      ${row.next === null ? "n/a" : JSON.stringify(row.next)}`);
  console.log(
    `outcome:  ${row.outcome}${row.errorCategory ? ` (${row.errorCategory}: ${row.errorMessage})` : ""}`,
  );
}
console.log("=== summary ===");
console.log(`published profiles scanned:   ${summary.scanned}`);
console.log(`legacy candidates:            ${summary.legacyCandidates}`);
console.log(`successful computations:      ${summary.computed}`);
console.log(`non-legacy profiles skipped:  ${summary.skippedNonLegacy}`);
console.log(`concurrent-change skips:      ${summary.skippedConcurrentChange}`);
console.log(`updated rows:                 ${summary.updated}`);
console.log(`errors:                       ${summary.errors}`);
console.log(`database writes performed:    ${summary.writesPerformed}`);
