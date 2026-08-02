import { describe, expect, it } from "bun:test";
import { PROVIDER_RESPONSE_JSON_SCHEMA, createGatewayTransport } from "./llm-gateway-transport";
import { fakeProviderConfig } from "./test-support/fake-llm-transport";
import { LlmSemanticError } from "./llm-semantic-contract";

const CONFIG = fakeProviderConfig({ maxResponseBytes: 512 });

function envelope(content: string) {
  return JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
    id: "provider-native-request-id",
  });
}

function respond(body: string, init: { status?: number; contentLength?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.contentLength) headers.set("content-length", init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

async function run(
  impl: (url: string, init: RequestInit) => Promise<Response>,
  config = CONFIG,
) {
  return createGatewayTransport(impl).request({ system: "s", user: "u", config });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LlmSemanticError);
    return (e as LlmSemanticError).code;
  }
  throw new Error("expected rejection");
}

describe("request formatting", () => {
  it("sends the credential in a provider header and requests strict JSON output", async () => {
    let seen: RequestInit | null = null;
    const out = await run(async (_url, init) => {
      seen = init;
      return respond(envelope('{"matches":[],"abstained":true}'));
    });
    const headers = (seen as unknown as RequestInit).headers as Record<string, string>;
    expect(headers["Lovable-API-Key"]).toBe("fake-key-not-a-secret");
    const body = JSON.parse(String((seen as unknown as RequestInit).body));
    expect(body.model).toBe("fake-model-v9");
    expect(body.response_format.json_schema).toEqual(PROVIDER_RESPONSE_JSON_SCHEMA);
    // The provider-facing schema carries SEMANTIC fields only.
    expect(Object.keys(PROVIDER_RESPONSE_JSON_SCHEMA.schema.properties).sort()).toEqual([
      "abstained",
      "matches",
    ]);
    expect(out.rawContent).toBe('{"matches":[],"abstained":true}');
  });

  it("returns only semantic text plus numeric usage, never the native object", async () => {
    const out = await run(async () => respond(envelope('{"matches":[],"abstained":true}')));
    expect(Object.keys(out).sort()).toEqual(["byteLength", "rawContent", "usage"]);
    expect(out.usage).toEqual({ promptTokens: 12, completionTokens: 4 });
    expect(JSON.stringify(out).includes("provider-native-request-id")).toBe(false);
  });
});

describe("status mapping", () => {
  const cases: Array<[number, string]> = [
    [429, "provider_rate_limited"],
    [500, "provider_server_error"],
    [502, "provider_server_error"],
    [503, "provider_server_error"],
    [504, "provider_timeout"],
    [400, "provider_client_error"],
    [401, "provider_client_error"],
  ];
  for (const [status, expected] of cases) {
    it(`maps ${status} to ${expected}`, async () => {
      expect(await codeOf(run(async () => respond("{}", { status })))).toBe(expected);
    });
  }
});

describe("failures", () => {
  it("maps an aborted request to a typed timeout without waiting", async () => {
    expect(
      await codeOf(
        run(async () => {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }),
      ),
    ).toBe("provider_timeout");
  });

  it("maps a network failure to a typed provider error", async () => {
    expect(
      await codeOf(
        run(async () => {
          throw new TypeError("fetch failed");
        }),
      ),
    ).toBe("provider_error");
  });

  it("never leaks the credential in a provider error message", async () => {
    try {
      await run(async () => {
        throw new TypeError(`fetch failed for ${CONFIG.apiKey}`);
      });
    } catch (e) {
      expect((e as Error).message.includes(CONFIG.apiKey)).toBe(false);
    }
  });
});

describe("response-size limit", () => {
  const content = (n: number) => envelope(`{"matches":[],"abstained":true,"pad":"${"x".repeat(n)}"}`);

  it("accepts a response just below the limit", async () => {
    const body = content(100);
    expect(new TextEncoder().encode(body).length).toBeLessThan(CONFIG.maxResponseBytes);
    const out = await run(async () => respond(body));
    expect(out.byteLength).toBeLessThanOrEqual(CONFIG.maxResponseBytes);
  });

  it("accepts a response exactly at the limit", async () => {
    const base = content(0);
    const pad = CONFIG.maxResponseBytes - new TextEncoder().encode(base).length;
    const body = content(pad);
    expect(new TextEncoder().encode(body).length).toBe(CONFIG.maxResponseBytes);
    const out = await run(async () => respond(body));
    expect(out.byteLength).toBe(CONFIG.maxResponseBytes);
  });

  it("rejects a response above the limit, and does not return the body", async () => {
    const body = content(CONFIG.maxResponseBytes);
    try {
      await run(async () => respond(body));
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as LlmSemanticError).code).toBe("provider_response_too_large");
      expect((e as Error).message.includes("xxxx")).toBe(false);
    }
  });

  it("rejects an oversized declared content-length before reading the body", async () => {
    let read = false;
    expect(
      await codeOf(
        run(async () => {
          read = true;
          return respond("{}", { contentLength: String(CONFIG.maxResponseBytes + 1) });
        }),
      ),
    ).toBe("provider_response_too_large");
    expect(read).toBe(true);
  });
});

describe("envelope handling", () => {
  it("passes non-JSON provider text through to the shared parser unrepaired", async () => {
    const out = await run(async () => respond("not json at all"));
    expect(out.rawContent).toBe("not json at all");
  });

  it("yields empty content when the envelope has no message content", async () => {
    const out = await run(async () => respond(JSON.stringify({ choices: [] })));
    expect(out.rawContent).toBe("");
  });
});