const DEFAULT_ACCOUNTS_BASE = "https://accounts.zoho.com";
const DEFAULT_MAIL_BASE = "https://mail.zoho.com";
const DEFAULT_MAIL_ADDRESS = "admin@tipulinks.co.il";
const MAX_SYNC_MESSAGES = 200;

type ZohoEnvelope<T> = {
  status?: { code?: number; description?: string };
  data?: T;
  error?: string;
};

type ZohoAccount = {
  accountId?: string | number;
  primaryEmailAddress?: string;
  mailboxAddress?: string;
  emailAddress?: Array<{ mailId?: string }>;
};

export type ZohoIncomingMessage = {
  messageId: string;
  folderId: string;
  threadId: string | null;
  fromAddress: string;
  senderName: string | null;
  subject: string;
  receivedAt: string;
  hasAttachment: boolean;
};

type ZohoMessageListRow = {
  messageId?: string | number;
  folderId?: string | number;
  threadId?: string | number;
  fromAddress?: string;
  sender?: string;
  subject?: string;
  receivedTime?: string | number;
  receivedtime?: string | number;
  sentDateInGMT?: string | number;
  hasAttachment?: string | number | boolean;
};

type ZohoSendResult = {
  messageId?: string | number;
  threadId?: string | number;
  subject?: string;
};

let tokenCache: { token: string; expiresAt: number } | null = null;
let accountIdCache: string | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing Zoho Mail environment variable: ${name}`);
  return value;
}

export function getZohoMailboxAddress(): string {
  return process.env.ZOHO_MAIL_ADDRESS?.trim().toLowerCase() || DEFAULT_MAIL_ADDRESS;
}

function getAccountsBase(): string {
  return process.env.ZOHO_ACCOUNTS_BASE?.trim() || DEFAULT_ACCOUNTS_BASE;
}

function getMailBase(): string {
  return process.env.ZOHO_MAIL_BASE?.trim() || DEFAULT_MAIL_BASE;
}

function apiDescription(value: unknown): string {
  if (!value || typeof value !== "object") return "Zoho Mail API request failed";
  const envelope = value as ZohoEnvelope<unknown>;
  return envelope.status?.description || envelope.error || "Zoho Mail API request failed";
}

async function refreshZohoAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: requiredEnv("ZOHO_CLIENT_ID"),
    client_secret: requiredEnv("ZOHO_CLIENT_SECRET"),
    refresh_token: requiredEnv("ZOHO_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });

  const response = await fetch(`${getAccountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!response.ok || !accessToken) {
    throw new Error(`Zoho OAuth failed: ${String(json.error ?? response.status)}`);
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : Number(json.expires_in ?? 3600);
  tokenCache = {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  };
  return accessToken;
}

async function zohoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await refreshZohoAccessToken();
  const response = await fetch(`${getMailBase()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as ZohoEnvelope<T>;
  const apiCode = json.status?.code;
  if (!response.ok || (typeof apiCode === "number" && apiCode >= 400)) {
    throw new Error(`${apiDescription(json)} (HTTP ${response.status})`);
  }
  if (json.data === undefined) throw new Error("Zoho Mail API returned no data.");
  return json.data;
}

export async function getZohoAccountId(): Promise<string> {
  if (accountIdCache) return accountIdCache;
  const mailbox = getZohoMailboxAddress();
  const accounts = await zohoRequest<ZohoAccount[]>("/api/accounts");
  const account = accounts.find((candidate) => {
    const addresses = [
      candidate.primaryEmailAddress,
      candidate.mailboxAddress,
      ...(candidate.emailAddress ?? []).map((entry) => entry.mailId),
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());
    return addresses.includes(mailbox);
  });
  if (!account?.accountId) throw new Error(`Zoho mailbox ${mailbox} was not found.`);
  accountIdCache = String(account.accountId);
  return accountIdCache;
}

function asIsoDate(value: string | number | undefined): string {
  const numeric = typeof value === "number" ? value : Number(value ?? NaN);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString();
  return new Date().toISOString();
}

export async function listRecentZohoIncomingMessages(): Promise<ZohoIncomingMessage[]> {
  const accountId = await getZohoAccountId();
  const query = new URLSearchParams({
    start: "1",
    limit: String(MAX_SYNC_MESSAGES),
    status: "all",
    includeto: "true",
    includesent: "false",
    includearchive: "false",
    sortBy: "date",
    sortorder: "false",
  });
  const rows = await zohoRequest<ZohoMessageListRow[]>(`/api/accounts/${accountId}/messages/view?${query}`);
  const mailbox = getZohoMailboxAddress();

  return rows
    .map((row): ZohoIncomingMessage | null => {
      if (!row.messageId || !row.folderId || !row.fromAddress) return null;
      if (row.fromAddress.trim().toLowerCase() === mailbox) return null;
      return {
        messageId: String(row.messageId),
        folderId: String(row.folderId),
        threadId:
          row.threadId === undefined || row.threadId === null || String(row.threadId) === "0"
            ? null
            : String(row.threadId),
        fromAddress: row.fromAddress.trim().toLowerCase(),
        senderName: row.sender?.trim() || null,
        subject: row.subject?.trim() || "ללא נושא",
        receivedAt: asIsoDate(row.receivedtime ?? row.sentDateInGMT),
        hasAttachment: row.hasAttachment === true || row.hasAttachment === 1 || row.hasAttachment === "1",
      };
    })
    .filter((row): row is ZohoIncomingMessage => row !== null);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function htmlEmailToText(html: string): string {
  const withoutUnsafeBlocks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutUnsafeBlocks)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getZohoMessageText(message: ZohoIncomingMessage): Promise<string> {
  const accountId = await getZohoAccountId();
  const data = await zohoRequest<{ content?: string }>(
    `/api/accounts/${accountId}/folders/${message.folderId}/messages/${message.messageId}/content?includeBlockContent=false`,
  );
  const content = typeof data.content === "string" ? data.content : "";
  return (htmlEmailToText(content) || "(הודעה ללא תוכן טקסטואלי)").slice(0, 50_000);
}

export function supportTicketSubject(subject: string, ticketCode: string): string {
  const clean = subject
    .replace(/\s*\[TL-[A-F0-9]{10}\]\s*/gi, " ")
    .replace(/^(?:re:\s*)+/i, "")
    .trim();
  return `Re: ${clean || "פנייה לטיפולינקס"} [TL-${ticketCode}]`;
}

export function extractSupportTicketCode(subject: string): string | null {
  return subject.match(/\[TL-([A-F0-9]{10})\]/i)?.[1]?.toUpperCase() ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

export function formatSupportEmailHtml(content: string, addReplySeparator = false): string {
  const safeContent = escapeHtml(content.trim()).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");

  const separator = addReplySeparator
    ? '<div aria-hidden="true" style="margin:24px 0 16px;border-top:1px solid #d1d5db;"></div>'
    : "";

  return [
    '<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#111827;">',
    safeContent,
    "</div>",
    separator,
  ].join("");
}

export async function sendZohoSupportEmail(args: {
  toAddress: string;
  subject: string;
  content: string;
}): Promise<{ messageId: string | null; threadId: string | null }> {
  const accountId = await getZohoAccountId();
  const data = await zohoRequest<ZohoSendResult>(`/api/accounts/${accountId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      fromAddress: getZohoMailboxAddress(),
      toAddress: args.toAddress,
      subject: args.subject,
      content: formatSupportEmailHtml(args.content),
      mailFormat: "html",
      encoding: "UTF-8",
    }),
  });
  return {
    messageId: data.messageId === undefined ? null : String(data.messageId),
    threadId: data.threadId === undefined ? null : String(data.threadId),
  };
}

export async function replyViaZoho(args: {
  messageId: string;
  toAddress: string;
  subject: string;
  content: string;
}): Promise<{ messageId: string | null; threadId: string | null }> {
  const accountId = await getZohoAccountId();
  const data = await zohoRequest<ZohoSendResult>(`/api/accounts/${accountId}/messages/${args.messageId}`, {
    method: "POST",
    body: JSON.stringify({
      fromAddress: getZohoMailboxAddress(),
      toAddress: args.toAddress,
      subject: args.subject,
      content: formatSupportEmailHtml(args.content, true),
      action: "reply",
      mailFormat: "html",
      encoding: "UTF-8",
    }),
  });
  return {
    messageId: data.messageId === undefined ? null : String(data.messageId),
    threadId: data.threadId === undefined ? null : String(data.threadId),
  };
}
