import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../supabase/migrations/20260830043000_whatsapp_budget_reservation_lifecycle.sql",
  ),
  "utf8",
);

describe("WhatsApp budget reservation lifecycle", () => {
  it("keeps active WhatsApp delivery reservations non-expiring", () => {
    expect(migration).toContain("when _source_type = 'whatsapp_lead' then 'infinity'::timestamptz");
    expect(migration).toContain("delivery.status in ('pending', 'queued', 'sent')");
    expect(migration).toContain("set expires_at = 'infinity'::timestamptz");
  });

  it("preserves the normal finite TTL for non-WhatsApp reservations", () => {
    expect(migration).toContain(
      "pg_catalog.now() + pg_catalog.make_interval(mins => greatest(_ttl_minutes, 5))",
    );
  });

  it("does not mark a delivered lead billed when reservation commit is rejected", () => {
    expect(migration).toContain(
      "v_commit_allowed := coalesce((v_result ->> 'allowed')::boolean, false)",
    );
    expect(migration).toContain("if v_commit_allowed then");

    const deliveredBranch = migration.slice(
      migration.indexOf("elsif v_status = 'delivered' then"),
      migration.indexOf("elsif v_status = 'read' then"),
    );
    expect(deliveredBranch).toContain("set billed_at = coalesce(billed_at, pg_catalog.now())");
    expect(deliveredBranch).not.toContain("set billed_at = pg_catalog.now()");
  });

  it("releases reservations only on terminal delivery failure", () => {
    const sentBranch = migration.slice(
      migration.indexOf("elsif v_status = 'sent' then"),
      migration.indexOf("elsif v_status = 'delivered' then"),
    );
    expect(sentBranch).not.toContain("release_monthly_budget_reservation");

    const failureBranch = migration.slice(
      migration.indexOf("elsif v_status in ('failed', 'undelivered') then"),
      migration.indexOf("return query select true"),
    );
    expect(failureBranch).toContain("release_monthly_budget_reservation");
  });
});
