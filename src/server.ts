import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { responseRobotsHeader, searchIndexingAllowed } from "./lib/seo-indexing";
import { readSystemSettings } from "./lib/system-settings.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then((m) => (m.default ?? m) as ServerEntry);
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function applySeoResponsePolicy(
  request: Request,
  response: Response,
  indexingAllowed = searchIndexingAllowed(),
): Response {
  const robots = responseRobotsHeader({
    requestUrl: request.url,
    indexingAllowed,
  });
  if (robots === null) return response;

  // Prefer preserving the original response object (including cookies and
  // provider-specific response semantics). Fall back to a shallow response
  // clone only when the runtime exposes immutable headers.
  try {
    response.headers.set("X-Robots-Tag", robots);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", robots);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function maintenanceExempt(pathname: string): boolean {
  return (
    ["/admin", "/auth", "/reset-password", "/api", "/_"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) || pathname.includes(".")
  );
}

function renderMaintenancePage(): Response {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>טיפולינקס — תחזוקה</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#f5faf8;color:#173c35"><main style="min-height:100vh;display:grid;place-items:center;padding:24px"><section style="max-width:560px;text-align:center;background:#fff;border:1px solid #dce9e5;border-radius:20px;padding:36px;box-shadow:0 10px 30px rgba(0,0,0,.06)"><h1 style="margin:0 0 12px;font-size:28px">טיפולינקס נמצא כרגע בתחזוקה</h1><p style="margin:0;line-height:1.7">אנחנו מבצעים עדכון קצר במערכת. ניתן לנסות שוב מאוחר יותר.</p></section></main></body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "300",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const runtimeSettings = await readSystemSettings();
      const url = new URL(request.url);
      const effectiveIndexing = searchIndexingAllowed() && runtimeSettings.searchIndexingEnabled;

      const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");
      if (
        runtimeSettings.maintenanceEnabled &&
        (request.method === "GET" || request.method === "HEAD") &&
        acceptsHtml &&
        !maintenanceExempt(url.pathname)
      ) {
        return renderMaintenancePage();
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      if (runtimeSettings.searchIndexingEnabled) {
        return applySeoResponsePolicy(request, normalized);
      }
      return applySeoResponsePolicy(request, normalized, effectiveIndexing);
    } catch (error) {
      console.error(error);
      return applySeoResponsePolicy(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        false,
      );
    }
  },
};
