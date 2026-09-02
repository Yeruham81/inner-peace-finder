import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { getTwilioConfig } from "./twilio-voice.server";
import { getZohoMailboxAddress, verifyZohoMailConnection } from "./zoho-mail.server";
import { whatsappContentSid, whatsappSender } from "./whatsapp-lead.server";

import type { AdminIntegrationCheck, AdminIntegrationStatus, IntegrationHealth } from "./admin-integrations.types";

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const LOCALITIES_RESOURCE_ID = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba";

let healthCache: { expiresAt: number; items: AdminIntegrationStatus[] } | null = null;

function missingEnv(names: string[]): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

function missingNamesDetail(names: string[]): string {
  return names.length === 1 ? `חסר משתנה תצורה: ${names[0]}` : `חסרים משתני תצורה: ${names.join(", ")}`;
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("integration_health_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function overallState(checks: AdminIntegrationCheck[]): IntegrationHealth {
  if (checks.some((check) => check.state === "error")) return "error";
  if (checks.some((check) => check.state === "warning")) return "warning";
  if (checks.every((check) => check.state === "planned")) return "planned";
  return "healthy";
}

function statusSummary(state: IntegrationHealth): string {
  if (state === "healthy") return "כל הבדיקות הזמינות עברו בהצלחה.";
  if (state === "warning") return "החיבור פעיל, אך יש רכיב שדורש תשומת לב או שאינו ניתן לבדיקה מלאה.";
  if (state === "error") return "אחת הבדיקות הקריטיות נכשלה.";
  return "האינטגרציה טרם הופעלה.";
}

async function latestOperationalDates(): Promise<{
  voiceAnsweredAt: string | null;
  whatsappDeliveredAt: string | null;
  emailDeliveredAt: string | null;
}> {
  try {
    const [voice, whatsapp, email] = await Promise.all([
      withTimeout(
        supabaseAdmin
          .from("voice_call_sessions")
          .select("therapist_answered_at")
          .eq("outcome", "answered")
          .not("therapist_answered_at", "is", null)
          .order("therapist_answered_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
      withTimeout(
        supabaseAdmin
          .from("whatsapp_lead_deliveries")
          .select("delivered_at")
          .not("delivered_at", "is", null)
          .order("delivered_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
      withTimeout(
        supabaseAdmin
          .from("email_lead_deliveries")
          .select("delivered_at")
          .not("delivered_at", "is", null)
          .order("delivered_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ]);

    return {
      voiceAnsweredAt: voice.error ? null : (voice.data?.therapist_answered_at ?? null),
      whatsappDeliveredAt: whatsapp.error ? null : (whatsapp.data?.delivered_at ?? null),
      emailDeliveredAt: email.error ? null : (email.data?.delivered_at ?? null),
    };
  } catch {
    return { voiceAnsweredAt: null, whatsappDeliveredAt: null, emailDeliveredAt: null };
  }
}

async function probeSupabase(checkedAt: string): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const configMissing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (configMissing.length > 0) {
    checks.push({ label: "תצורת שרת", state: "error", detail: missingNamesDetail(configMissing) });
  } else {
    checks.push({ label: "תצורת שרת", state: "healthy", detail: "כתובת הפרויקט ומפתח service role מוגדרים" });
  }

  if (configMissing.length > 0) {
    const state = overallState(checks);
    return {
      key: "supabase",
      provider: "Supabase",
      description: "מסד הנתונים, אימות המשתמשים ואחסון הקבצים של טיפולינקס.",
      uses: ["Database", "Authentication", "Storage", "RLS / RPC"],
      state,
      summary: statusSummary(state),
      checkedAt,
      checks,
    };
  }

  const results = await Promise.allSettled([
    withTimeout(supabaseAdmin.from("therapists").select("id").limit(1)),
    withTimeout(supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })),
    withTimeout(supabaseAdmin.storage.listBuckets()),
  ]);

  const labels = ["Database", "Authentication", "Storage"];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]!;
    if (result.status === "rejected") {
      checks.push({ label: labels[index]!, state: "error", detail: "הבדיקה לא הושלמה" });
      continue;
    }
    const value = result.value as { error?: { message?: string } | null };
    checks.push({
      label: labels[index]!,
      state: value.error ? "error" : "healthy",
      detail: value.error ? "Supabase החזיר שגיאה" : "הבדיקה הצליחה",
    });
  }

  const state = overallState(checks);
  return {
    key: "supabase",
    provider: "Supabase",
    description: "מסד הנתונים, אימות המשתמשים ואחסון הקבצים של טיפולינקס.",
    uses: ["Database", "Authentication", "Storage", "RLS / RPC"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeOpenAI(checkedAt: string): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const missing = missingEnv(["OPENAI_API_KEY", "OPENAI_MODEL"]);
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model = process.env.OPENAI_MODEL?.trim() ?? "";

  if (missing.length > 0 || !apiKey || !model) {
    checks.push({
      label: "תצורה",
      state: "error",
      detail: missing.length > 0 ? missingNamesDetail(missing) : "תצורת OpenAI אינה תקינה",
    });
    const state = overallState(checks);
    return {
      key: "openai",
      provider: "OpenAI",
      description: "ניתוח טקסט וחיפוש סמנטי.",
      uses: ["חיפוש סמנטי", "ניתוח ניסוח חופשי"],
      state,
      summary: statusSummary(state),
      checkedAt,
      checks,
    };
  }

  checks.push({ label: "תצורה", state: "healthy", detail: `מודל פעיל: ${model}` });

  try {
    const response = await fetchWithTimeout(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (response.ok) {
      checks.push({ label: "OpenAI API", state: "healthy", detail: "המפתח תקף והמודל נגיש לחשבון" });
    } else {
      const detail =
        response.status === 401 || response.status === 403
          ? "מפתח ה-API נדחה"
          : response.status === 404
            ? "המודל שהוגדר אינו נגיש לחשבון"
            : `OpenAI החזיר HTTP ${response.status}`;
      checks.push({ label: "OpenAI API", state: "error", detail });
    }
  } catch {
    checks.push({ label: "OpenAI API", state: "error", detail: "לא ניתן להשלים את בדיקת החיבור" });
  }

  const state = overallState(checks);
  return {
    key: "openai",
    provider: "OpenAI",
    description: "ניתוח טקסט וחיפוש סמנטי.",
    uses: ["חיפוש סמנטי", "ניתוח ניסוח חופשי"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeTwilio(
  checkedAt: string,
  operational: Awaited<ReturnType<typeof latestOperationalDates>>,
): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  let config: ReturnType<typeof getTwilioConfig> | null = null;

  try {
    config = getTwilioConfig();
    checks.push({
      label: "Voice configuration",
      state: "healthy",
      detail: "Account, restricted API key ומספר טלפון מוגדרים",
    });
  } catch {
    const missing = missingEnv([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    ]);
    checks.push({
      label: "Voice configuration",
      state: "error",
      detail: missing.length > 0 ? missingNamesDetail(missing) : "תצורת Twilio אינה מלאה",
    });
  }

  if (config) {
    try {
      const response = await fetchWithTimeout(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}.json`,
        {
          method: "GET",
          headers: { Authorization: basicAuth(config.accountSid, config.authToken), Accept: "application/json" },
        },
      );
      if (!response.ok) {
        checks.push({ label: "Twilio REST API", state: "error", detail: `Twilio החזיר HTTP ${response.status}` });
      } else {
        const body = (await response.json().catch(() => null)) as { status?: string } | null;
        const accountStatus = body?.status?.toLowerCase();
        checks.push({
          label: "Twilio REST API",
          state: accountStatus === "active" ? "healthy" : "error",
          detail: accountStatus === "active" ? "החשבון פעיל וה-Auth Token תקף" : "חשבון Twilio אינו במצב active",
        });
      }
    } catch {
      checks.push({ label: "Twilio REST API", state: "error", detail: "לא ניתן להשלים את בדיקת החשבון" });
    }
  }

  checks.push(
    operational.voiceAnsweredAt
      ? { label: "שיחה שנענתה לאחרונה", state: "healthy", detail: "נרשמה שיחה מוצלחת", at: operational.voiceAnsweredAt }
      : { label: "שיחה שנענתה לאחרונה", state: "warning", detail: "לא נמצאה היסטוריית שיחה שנענתה" },
  );

  const state = overallState(checks);
  return {
    key: "twilio",
    provider: "Twilio",
    description: "ספק התקשורת עבור שיחות Voice והעברת הודעות WhatsApp.",
    uses: ["Voice", "WhatsApp transport", "Webhooks"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

type WhatsAppApproval = {
  whatsapp?: {
    category?: string;
    status?: string;
    rejection_reason?: string;
    name?: string;
  };
};

async function probeMetaWhatsApp(
  checkedAt: string,
  operational: Awaited<ReturnType<typeof latestOperationalDates>>,
): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const sender = whatsappSender();
  const contentSid = whatsappContentSid();

  checks.push({
    label: "WhatsApp Sender",
    state: sender ? "healthy" : "error",
    detail: sender ? "מספר השולח מוגדר ב-Twilio" : "TWILIO_WHATSAPP_FROM אינו מוגדר",
  });
  checks.push({
    label: "Content Template",
    state: contentSid ? "healthy" : "error",
    detail: contentSid ? "Content SID מוגדר" : "TIPULINKS_WHATSAPP_LEAD_CONTENT_SID אינו מוגדר",
  });

  let config: ReturnType<typeof getTwilioConfig> | null = null;
  try {
    config = getTwilioConfig();
  } catch {
    checks.push({
      label: "Twilio credentials",
      state: "error",
      detail: "לא ניתן לבדוק את סטטוס התבנית ללא תצורת Twilio",
    });
  }

  if (config && contentSid) {
    try {
      const response = await fetchWithTimeout(
        `https://content.twilio.com/v1/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`,
        {
          method: "GET",
          headers: { Authorization: basicAuth(config.accountSid, config.authToken), Accept: "application/json" },
        },
      );
      if (!response.ok) {
        checks.push({
          label: "אישור Meta",
          state: "error",
          detail: `Twilio Content API החזיר HTTP ${response.status}`,
        });
      } else {
        const approval = (await response.json().catch(() => null)) as WhatsAppApproval | null;
        const status = approval?.whatsapp?.status?.toLowerCase() || "unknown";
        const category = approval?.whatsapp?.category?.toUpperCase();
        const isApproved = status === "approved";
        const isRejected = status === "rejected";
        checks.push({
          label: "אישור Meta",
          state: isApproved ? "healthy" : isRejected ? "error" : "warning",
          detail: `סטטוס: ${status}${category ? ` · קטגוריה: ${category}` : ""}`,
        });
      }
    } catch {
      checks.push({ label: "אישור Meta", state: "error", detail: "לא ניתן לקרוא את סטטוס האישור של התבנית" });
    }
  }

  checks.push(
    operational.whatsappDeliveredAt
      ? {
          label: "מסירה אחרונה",
          state: "healthy",
          detail: "נרשמה הודעת WhatsApp שנמסרה",
          at: operational.whatsappDeliveredAt,
        }
      : { label: "מסירה אחרונה", state: "warning", detail: "לא נמצאה מסירת WhatsApp מוצלחת" },
  );

  const state = overallState(checks);
  return {
    key: "meta-whatsapp",
    provider: "Meta / WhatsApp Business",
    description: "סטטוס תבנית WhatsApp והאישור שלה ב-Meta, דרך Twilio Content API.",
    uses: ["WABA", "WhatsApp Sender", "Content Template", "Template approval"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeBrevo(
  checkedAt: string,
  operational: Awaited<ReturnType<typeof latestOperationalDates>>,
): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    checks.push({ label: "Brevo API", state: "error", detail: "BREVO_API_KEY אינו מוגדר" });
  } else {
    try {
      const response = await fetchWithTimeout("https://api.brevo.com/v3/account", {
        method: "GET",
        headers: { Accept: "application/json", "api-key": apiKey },
      });
      checks.push({
        label: "Brevo API",
        state: response.ok ? "healthy" : "error",
        detail: response.ok ? "המפתח תקף וחשבון Brevo נגיש" : `Brevo החזיר HTTP ${response.status}`,
      });
    } catch {
      checks.push({ label: "Brevo API", state: "error", detail: "לא ניתן להשלים את בדיקת החיבור" });
    }
  }

  checks.push({
    label: "Webhook מסירת אימייל",
    state: process.env.BREVO_WEBHOOK_SECRET?.trim() ? "healthy" : "warning",
    detail: process.env.BREVO_WEBHOOK_SECRET?.trim() ? "סוד ה-webhook מוגדר" : "BREVO_WEBHOOK_SECRET אינו מוגדר",
  });

  const recruitmentMissing = missingEnv([
    "BREVO_RECRUITMENT_FOLDER_ID",
    "BREVO_RECRUITMENT_TEMPLATE_ID",
    "BREVO_RECRUITMENT_FROM_ADDRESS",
  ]);
  checks.push({
    label: "הזמנות מטפלים",
    state: recruitmentMissing.length === 0 ? "healthy" : "warning",
    detail: recruitmentMissing.length === 0 ? "תצורת הגיוס מלאה" : missingNamesDetail(recruitmentMissing),
  });

  checks.push(
    operational.emailDeliveredAt
      ? {
          label: "מסירת אימייל אחרונה",
          state: "healthy",
          detail: "נרשמה מסירת אימייל מוצלחת",
          at: operational.emailDeliveredAt,
        }
      : { label: "מסירת אימייל אחרונה", state: "warning", detail: "לא נמצאה מסירת אימייל מוצלחת" },
  );

  const state = overallState(checks);
  return {
    key: "brevo",
    provider: "Brevo",
    description: "משלוח אימיילים מערכתיים, פניות מטופלים והזמנות מטפלים.",
    uses: ["Transactional Email", "Lead delivery", "Recruitment", "Webhooks"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeZoho(checkedAt: string): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const missing = missingEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"]);

  if (missing.length > 0) {
    checks.push({ label: "OAuth", state: "error", detail: missingNamesDetail(missing) });
  } else {
    try {
      await withTimeout(verifyZohoMailConnection());
      checks.push({ label: "OAuth", state: "healthy", detail: "Refresh token תקף" });
      checks.push({ label: "Zoho Mail API", state: "healthy", detail: `התיבה ${getZohoMailboxAddress()} נגישה` });
      checks.push({
        label: "קריאה ו-Reply",
        state: "healthy",
        detail: "מופעלים דרך אותו חיבור OAuth; לא נשלחת הודעת בדיקה",
      });
    } catch {
      checks.push({ label: "OAuth / Mail API", state: "error", detail: "לא ניתן לאמת את התיבה דרך Zoho Mail API" });
    }
  }

  const state = overallState(checks);
  return {
    key: "zoho",
    provider: "Zoho Mail",
    description: "תיבת פניות הצוות והתגובות מתוך מסך האדמין.",
    uses: ["קריאת אימיילים", "סנכרון שרשורים", "Reply"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeDataGov(checkedAt: string): Promise<AdminIntegrationStatus> {
  const checks: AdminIntegrationCheck[] = [];
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${LOCALITIES_RESOURCE_ID}&limit=1`;

  try {
    const response = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json" } });
    const body = response.ok
      ? ((await response.json().catch(() => null)) as { success?: boolean; result?: { records?: unknown[] } } | null)
      : null;
    const valid = Boolean(response.ok && body?.success && Array.isArray(body.result?.records));
    checks.push({
      label: "מאגר היישובים",
      state: valid ? "healthy" : "warning",
      detail: valid ? "data.gov.il זמין" : "המקור החיצוני אינו זמין; האפליקציה תוכל להשתמש ב-cache תקין אם כבר נטען",
    });
  } catch {
    checks.push({
      label: "מאגר היישובים",
      state: "warning",
      detail: "המקור החיצוני אינו זמין; האפליקציה תוכל להשתמש ב-cache תקין אם כבר נטען",
    });
  }

  const state = overallState(checks);
  return {
    key: "data-gov",
    provider: "data.gov.il",
    description: "מקור רשימת היישובים הרשמית בישראל.",
    uses: ["רשימת יישובים", "שיוך אזורים"],
    state,
    summary: statusSummary(state),
    checkedAt,
    checks,
  };
}

async function probeLovable(checkedAt: string): Promise<AdminIntegrationStatus> {
  const origin = process.env.TIPULINKS_PUBLIC_ORIGIN?.trim();
  let originHealthy = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      originHealthy =
        parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    } catch {
      originHealthy = false;
    }
  }

  const checks: AdminIntegrationCheck[] = [
    {
      label: "Cloud runtime",
      state: "healthy",
      detail: "פונקציית בדיקת האינטגרציות רצה בצד השרת",
    },
    {
      label: "Public origin",
      state: originHealthy ? "healthy" : "warning",
      detail: originHealthy ? "TIPULINKS_PUBLIC_ORIGIN מוגדר כ-HTTPS" : "לא ניתן לאמת TIPULINKS_PUBLIC_ORIGIN",
    },
    {
      label: "Google OAuth",
      state: "warning",
      detail: "מוגדר דרך Lovable Auth בקוד; כניסה אמיתית אינה מופעלת כחלק מבדיקת הבריאות",
    },
    {
      label: "Apple OAuth",
      state: "warning",
      detail: "מוגדר דרך Lovable Auth בקוד; כניסה אמיתית אינה מופעלת כחלק מבדיקת הבריאות",
    },
  ];

  const state = overallState(checks);
  return {
    key: "lovable",
    provider: "Lovable Cloud / Auth",
    description: "Runtime האפליקציה ושכבת OAuth שמחברת את ספקי ההתחברות.",
    uses: ["Hosting / Runtime", "Google OAuth", "Apple OAuth"],
    state,
    summary: "ה-runtime פעיל; ספקי OAuth אינם נבדקים באמצעות התחברות אוטומטית.",
    checkedAt,
    checks,
  };
}

function plannedIntegration(
  key: "google-analytics" | "payment",
  provider: string,
  description: string,
  uses: string[],
  checkedAt: string,
): AdminIntegrationStatus {
  return {
    key,
    provider,
    description,
    uses,
    state: "planned",
    summary: "מתוכנן לשלב מאוחר יותר.",
    checkedAt,
    checks: [{ label: "סטטוס", state: "planned", detail: "טרם הוגדר" }],
  };
}

export async function getAdminIntegrationStatusesServer(
  input: { force?: boolean } = {},
): Promise<AdminIntegrationStatus[]> {
  const now = Date.now();
  if (!input.force && healthCache && healthCache.expiresAt > now) return healthCache.items;

  const checkedAt = new Date(now).toISOString();
  const operational = await latestOperationalDates();
  const settled = await Promise.allSettled([
    probeSupabase(checkedAt),
    probeOpenAI(checkedAt),
    probeTwilio(checkedAt, operational),
    probeMetaWhatsApp(checkedAt, operational),
    probeBrevo(checkedAt, operational),
    probeZoho(checkedAt),
    probeDataGov(checkedAt),
    probeLovable(checkedAt),
  ]);

  const fallbackMetadata: Array<Pick<AdminIntegrationStatus, "key" | "provider" | "description" | "uses">> = [
    {
      key: "supabase",
      provider: "Supabase",
      description: "Database, Auth ו-Storage.",
      uses: ["Database", "Authentication", "Storage"],
    },
    { key: "openai", provider: "OpenAI", description: "חיפוש סמנטי וניתוח טקסט.", uses: ["Semantic search"] },
    { key: "twilio", provider: "Twilio", description: "Voice ותשתית תקשורת.", uses: ["Voice", "WhatsApp transport"] },
    {
      key: "meta-whatsapp",
      provider: "Meta / WhatsApp Business",
      description: "WABA ותבניות WhatsApp.",
      uses: ["Template approval"],
    },
    { key: "brevo", provider: "Brevo", description: "אימיילים מערכתיים.", uses: ["Transactional Email"] },
    { key: "zoho", provider: "Zoho Mail", description: "תיבת פניות הצוות.", uses: ["Mail API"] },
    { key: "data-gov", provider: "data.gov.il", description: "מקור היישובים.", uses: ["Localities"] },
    {
      key: "lovable",
      provider: "Lovable Cloud / Auth",
      description: "Runtime ו-OAuth.",
      uses: ["Cloud runtime", "OAuth"],
    },
  ];

  const items = settled.map((result, index): AdminIntegrationStatus => {
    if (result.status === "fulfilled") return result.value;
    const meta = fallbackMetadata[index]!;
    return {
      ...meta,
      state: "error",
      summary: "בדיקת הבריאות לא הושלמה.",
      checkedAt,
      checks: [{ label: "בדיקה", state: "error", detail: "אירעה שגיאה פנימית בבדיקת האינטגרציה" }],
    };
  });

  items.push(
    plannedIntegration(
      "google-analytics",
      "Google Analytics",
      "מדידת שימוש באתר לאחר ההשקה.",
      ["Analytics", "Events"],
      checkedAt,
    ),
    plannedIntegration(
      "payment",
      "ספק סליקה",
      "חיוב מטפלים וטוקניזציה לאחר בחירת ספק הסליקה.",
      ["Payments", "Tokens", "Webhooks"],
      checkedAt,
    ),
  );

  healthCache = { expiresAt: now + CACHE_TTL_MS, items };
  return items;
}
