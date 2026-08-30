import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  brevoEmailLeadDeliveryId,
  brevoEmailLeadTag,
  normalizeBrevoEmailEvent,
  verifyBrevoWebhookAuthorization,
} from "./lead-delivery.server";

const migration = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260830054000_email_delivery_billing.sql"),
  "utf8",
);
const leadSource = readFileSync(join(import.meta.dir, "lead.functions.ts"), "utf8");
const deliverySource = readFileSync(join(import.meta.dir, "lead-delivery.server.ts"), "utf8");
const routeSource = readFileSync(
  join(import.meta.dir, "../routes/api/public/email/lead-status.ts"),
  "utf8",
);
const accountActivityMigration = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260823223000_account_activity_data.sql"),
  "utf8",
);

const deliveryId = "1f0dd41e-58ec-4a6f-bc5a-87ea2de9c348";

describe("Brevo Email delivery correlation", () => {
  it("round-trips the private delivery id through an Email tag", () => {
    const tag = brevoEmailLeadTag(deliveryId);
    expect(tag).toBe(`tipulinks_email_lead_${deliveryId}`);
    expect(brevoEmailLeadDeliveryId(["tipulinks_email_lead", tag])).toBe(deliveryId);
    expect(brevoEmailLeadDeliveryId(["tipulinks_email_lead_not-a-uuid"])).toBeNull();
  });

  it("normalizes Brevo webhook event spellings", () => {
    expect(normalizeBrevoEmailEvent("delivered")).toBe("delivered");
    expect(normalizeBrevoEmailEvent("hardBounce")).toBe("hard_bounce");
    expect(normalizeBrevoEmailEvent("softBounce")).toBe("soft_bounce");
    expect(normalizeBrevoEmailEvent("invalid")).toBe("invalid_email");
  });

  it("fails closed unless the configured Bearer token matches", () => {
    const previous = process.env["BREVO_WEBHOOK_SECRET"];
    try {
      process.env["BREVO_WEBHOOK_SECRET"] = "test-brevo-webhook-secret";
      expect(
        verifyBrevoWebhookAuthorization(
          new Request("https://tipulinks.co.il/api/public/email/lead-status", {
            headers: { authorization: "Bearer test-brevo-webhook-secret" },
          }),
        ),
      ).toBe(true);
      expect(
        verifyBrevoWebhookAuthorization(
          new Request("https://tipulinks.co.il/api/public/email/lead-status", {
            headers: { authorization: "Bearer wrong-secret" },
          }),
        ),
      ).toBe(false);
      delete process.env["BREVO_WEBHOOK_SECRET"];
      expect(
        verifyBrevoWebhookAuthorization(
          new Request("https://tipulinks.co.il/api/public/email/lead-status", {
            headers: { authorization: "Bearer test-brevo-webhook-secret" },
          }),
        ),
      ).toBe(false);
    } finally {
      if (previous === undefined) delete process.env["BREVO_WEBHOOK_SECRET"];
      else process.env["BREVO_WEBHOOK_SECRET"] = previous;
    }
  });
});

describe("Email delivered-only billing", () => {
  it("sends the delivery correlation tag to Brevo", () => {
    expect(deliverySource).toContain('tags: ["tipulinks_email_lead", brevoEmailLeadTag(payload.deliveryId)]');
    expect(deliverySource).toContain('status: "sent"');
    expect(deliverySource).toContain("Final mailbox delivery/bounce status is a separate provider event");
  });

  it("reserves budget before send and creates the CTA as non-billable", () => {
    expect(migration).toContain("'cta_click',");
    expect(migration).toContain("_therapist_id::text || ':' || _session_id || ':' || coalesce(_cta_id, 'primary')");
    expect(migration).toContain("billable_eligible boolean not null default false");
    expect(migration).toMatch(/INSERT INTO public\.cta_clicks[\s\S]*?_user_agent, false\)/);
    expect(migration).toContain("INSERT INTO public.email_lead_deliveries");
  });

  it("keeps Email charges compatible with the existing account billing ledger", () => {
    expect(migration).toContain("'cta_click',");
    expect(accountActivityMigration).toContain("reservation.source_type = 'cta_click'");
    expect(accountActivityMigration).toContain(
      "reservation.source_key = click.therapist_id::text || ':' || click.session_id || ':' || click.cta_id",
    );
  });

  it("charges only on delivered and releases the reservation on delivery failure", () => {
    const delivered = migration.slice(
      migration.indexOf("elsif v_status = 'delivered' then"),
      migration.indexOf("elsif v_status in ('hard_bounce'"),
    );
    expect(delivered).toContain("commit_monthly_budget_reservation");
    expect(delivered).toContain("set billable = true");

    const failures = migration.slice(
      migration.indexOf("elsif v_status in ('hard_bounce'"),
      migration.indexOf("return query select true"),
    );
    expect(failures).toContain("release_monthly_budget_reservation");
    expect(failures).not.toContain("set billable = true");
  });

  it("does not bill accepted or deferred mail and protects terminal states from late callbacks", () => {
    const accepted = migration.slice(
      migration.indexOf("if v_status in ('request', 'sent') then"),
      migration.indexOf("elsif v_status = 'delivered' then"),
    );
    expect(accepted).not.toContain("set billable = true");
    expect(accepted).not.toContain("commit_monthly_budget_reservation");
    expect(migration).toContain("v_delivery.status in ('pending', 'accepted', 'deferred')");
    expect(migration).toContain("v_delivery.status not in ('hard_bounce', 'soft_bounce', 'blocked', 'invalid_email', 'error')");
  });

  it("keeps Brevo acceptance pending in the UI-facing response", () => {
    expect(leadSource).toContain('.rpc("attach_email_lead_message"');
    expect(leadSource).toContain('.rpc("fail_email_lead_delivery"');
    expect(leadSource).toContain('channel === "email" && result.status === "sent"');
    expect(leadSource).toMatch(/channel === "email" && result\.status === "sent"[\s\S]*?\("pending" as const\)/);
  });

  it("uses an authenticated webhook and idempotent database bookkeeping", () => {
    expect(routeSource).toContain("verifyBrevoWebhookAuthorization(request)");
    expect(routeSource).toContain('.rpc("record_email_lead_status"');
    expect(migration).toContain("if v_delivery.billed_at is null");
    expect(migration).toContain("set billed_at = coalesce(billed_at, pg_catalog.now())");
  });
});
