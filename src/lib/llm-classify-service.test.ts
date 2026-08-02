/**
 * Server-boundary tests for the semantic classification endpoint.
 * No live provider request, no credentials, no network: the real server
 * orchestration runs against a scripted transport and a scripted catalog.
 */
import { describe, expect, it } from "bun:test";
import {
  CLASSIFY_REQUEST_FIELDS,
  classifySemanticRemainder,
  handleClassifyRequest,
  httpStatusForCode,
  isRetryableCode,
  parseClassifyRequest,
  type ClassifyDeps,
  type LlmClassifyLog,
} from "./llm-classify-service";
import { LLM_MAX_REMAINDER_LENGTH } from "./llm-provider-config";
import {
  LlmProviderError,
  LlmProviderServerError,
  LlmRateLimitedError,
  LlmSemanticError,
  LlmTimeoutError,
  type CanonicalProblemEntry,
} from "./llm-semantic-contract";
import { LLM_SEMANTIC_PROMPT_VERSION } from "./llm-semantic-prompt";
import {
  createScriptedTransport,
  fakeProviderConfig,
  type ScriptedStep,
} from "./test-support/fake-llm-transport";

const CATALOG: CanonicalProblemEntry[] = [
  { slug: "anxiety", name: "חרדה", aliases: ["פחדים"] },
  { slug: "depression", name: "דיכאון", aliases: ["מצב רוח ירוד"] },
  { slug: "trauma", name: "טראומה", aliases: [] },
  { slug: "ocd_compulsions", name: "אובססיות", aliases: [] },
];

const VALID = JSON.stringify({
  matches: [
    { slug: "anxiety", confidence: 0.8 },
    { slug: "depression", confidence: 0.4 },
  ],
  abstained: false,
});
const ABSTAIN = JSON.stringify({ matches: [], abstained: true });

type Harness = {
  deps: ClassifyDeps;
  transport: ReturnType<typeof createScriptedTransport>;
  logs: LlmClassifyLog[];
  catalogReads: number;
};

function harness(
  steps: ScriptedStep[] = [{ kind: "raw", content: VALID }],
  options: {
    catalog?: CanonicalProblemEntry[] | (() => Promise<CanonicalProblemEntry[]>);
    config?: Parameters<typeof fakeProviderConfig>[0];
  } = {},
): Harness {
  const transport = createScriptedTransport(steps);
  const logs: LlmClassifyLog[] = [];
  const state = { catalogReads: 0 };
  const loader =
    typeof options.catalog === "function"
      ? options.catalog
      : async () => options.catalog ?? CATALOG;
  const h: Harness = {
    transport,
    logs,
    get catalogReads() {
      return state.catalogReads;
    },
    deps: {
      transport,
      config: fakeProviderConfig(options.config),
      logger: (r) => logs.push(r),
      loadCatalog: async () => {
        state.catalogReads += 1;
        return loader();
      },
    },
  } as Harness;
  return h;
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

/* ------------------------------------------------------------------ */
/* Request handling                                                    */
/* ------------------------------------------------------------------ */

describe("public request contract", () => {
  it("accepts only semanticRemainder", () => {
    expect(CLASSIFY_REQUEST_FIELDS).toEqual(["semanticRemainder"]);
    expect(parseClassifyRequest({ semanticRemainder: "חרדה" })).toEqual({
      semanticRemainder: "חרדה",
    });
  });

  it("handles a valid request end to end", async () => {
    const h = harness();
    const result = await classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps);
    expect(result.matches.map((m) => m.slug)).toEqual(["anxiety", "depression"]);
    expect(result.abstained).toBe(false);
  });

  it("rejects a malformed JSON body at the HTTP boundary", async () => {
    const h = harness();
    const res = await handleClassifyRequest(
      { method: "POST", text: async () => "{not json" },
      h.deps,
    );
    expect(res).toEqual({ status: 400, body: { error: { code: "invalid_request" } } });
    expect(h.transport.callCount).toBe(0);
  });

  it("rejects a non-POST method", async () => {
    const h = harness();
    const res = await handleClassifyRequest({ method: "GET", text: async () => "{}" }, h.deps);
    expect(res.status).toBe(405);
    expect(h.transport.callCount).toBe(0);
  });

  it("rejects a missing remainder", async () => {
    expect(await codeOf(classifySemanticRemainder({}, harness().deps))).toBe("invalid_request");
  });

  it("rejects a non-string remainder", async () => {
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: 5 }, harness().deps))).toBe(
      "invalid_request",
    );
  });

  it("rejects a non-object body", async () => {
    expect(await codeOf(classifySemanticRemainder([], harness().deps))).toBe("invalid_request");
    expect(await codeOf(classifySemanticRemainder("x", harness().deps))).toBe("invalid_request");
  });

  it("returns local abstention for an empty remainder without provider or catalog access", async () => {
    const h = harness();
    const r = await classifySemanticRemainder({ semanticRemainder: "" }, h.deps);
    expect(r.abstained).toBe(true);
    expect(r.matches).toEqual([]);
    expect(h.transport.callCount).toBe(0);
    expect(h.catalogReads).toBe(0);
  });

  it("returns local abstention for a whitespace-only remainder", async () => {
    const h = harness();
    const r = await classifySemanticRemainder({ semanticRemainder: "   \n " }, h.deps);
    expect(r.abstained).toBe(true);
    expect(h.transport.callCount).toBe(0);
  });

  it("rejects an oversized remainder before any provider call", async () => {
    const h = harness();
    expect(
      await codeOf(
        classifySemanticRemainder(
          { semanticRemainder: "א".repeat(LLM_MAX_REMAINDER_LENGTH + 1) },
          h.deps,
        ),
      ),
    ).toBe("input_too_large");
    expect(h.transport.callCount).toBe(0);
    expect(h.catalogReads).toBe(0);
  });

  const rejectedFields: Array<[string, Record<string, unknown>]> = [
    ["allowedProblems", { allowedProblems: [{ slug: "made_up", name: "x", aliases: [] }] }],
    ["allowedSlugs", { allowedSlugs: ["made_up"] }],
    ["aliases", { aliases: ["פחדים"] }],
    ["problemNames", { problemNames: ["חרדה"] }],
    ["promptVersion", { promptVersion: "attacker-v1" }],
    ["modelVersion", { modelVersion: "attacker-model" }],
    ["filters", { filters: { cityNames: ["חיפה"] } }],
    ["therapists", { therapists: [{ id: "t1", full_name: "x" }] }],
    ["userId", { userId: "u1" }],
  ];
  for (const [label, extra] of rejectedFields) {
    it(`rejects caller-supplied ${label}`, async () => {
      const h = harness();
      expect(
        await codeOf(
          classifySemanticRemainder({ semanticRemainder: "חרדה", ...extra }, h.deps),
        ),
      ).toBe("invalid_request");
      expect(h.transport.callCount).toBe(0);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Canonical catalog ownership                                         */
/* ------------------------------------------------------------------ */

describe("server-owned canonical catalog", () => {
  it("loads the catalog server-side for every classification", async () => {
    const h = harness();
    await classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps);
    expect(h.catalogReads).toBe(1);
    expect(h.transport.lastRequest?.user).toContain("anxiety|חרדה|פחדים");
  });

  it("a caller cannot add a valid slug", async () => {
    const h = harness([{ kind: "raw", content: JSON.stringify({ matches: [{ slug: "made_up", confidence: 0.9 }], abstained: false }) }]);
    // Even the request that tried to supply the slug is rejected outright.
    expect(
      await codeOf(
        classifySemanticRemainder(
          { semanticRemainder: "חרדה", allowedProblems: [{ slug: "made_up", name: "m", aliases: [] }] },
          h.deps,
        ),
      ),
    ).toBe("invalid_request");
    // And the server catalog still rejects the slug on the accepted path.
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "unknown_slug",
    );
  });

  it("a caller cannot remove a valid slug", async () => {
    const h = harness([{ kind: "raw", content: VALID }]);
    const r = await classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps);
    expect(r.matches[0]?.slug).toBe("anxiety");
  });

  it("accepts a known canonical slug and rejects an unknown one", async () => {
    expect(
      (
        await classifySemanticRemainder(
          { semanticRemainder: "חרדה" },
          harness([{ kind: "raw", content: JSON.stringify({ matches: [{ slug: "trauma", confidence: 0.5 }], abstained: false }) }]).deps,
        )
      ).matches[0]?.slug,
    ).toBe("trauma");
    expect(
      await codeOf(
        classifySemanticRemainder(
          { semanticRemainder: "חרדה" },
          harness([{ kind: "raw", content: JSON.stringify({ matches: [{ slug: "nope", confidence: 0.5 }], abstained: false }) }]).deps,
        ),
      ),
    ).toBe("unknown_slug");
  });

  it("rejects an alias or display name returned as a slug", async () => {
    for (const bad of ["פחדים", "חרדה", "Anxiety Disorder"]) {
      expect(
        await codeOf(
          classifySemanticRemainder(
            { semanticRemainder: "משהו" },
            harness([{ kind: "raw", content: JSON.stringify({ matches: [{ slug: bad, confidence: 0.6 }], abstained: false }) }]).deps,
          ),
        ),
      ).toBe("unknown_slug");
    }
  });

  it("propagates a catalog database failure as catalog_error and never calls the provider", async () => {
    const h = harness([{ kind: "raw", content: VALID }], {
      catalog: async () => {
        throw new Error("PostgrestError: relation problems does not exist");
      },
    });
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "catalog_error",
    );
    expect(h.transport.callCount).toBe(0);
  });

  it("does not treat an empty catalog as valid data", async () => {
    const h = harness([{ kind: "raw", content: VALID }], { catalog: [] });
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "catalog_error",
    );
  });

  it("catalog ordering and duplicate rows do not weaken validation", async () => {
    const reversed = [...CATALOG].reverse();
    const duplicated = [...CATALOG, ...CATALOG];
    for (const catalog of [reversed, duplicated]) {
      const ok = await classifySemanticRemainder(
        { semanticRemainder: "חרדה" },
        harness([{ kind: "raw", content: VALID }], { catalog }).deps,
      );
      expect(ok.matches.map((m) => m.slug)).toEqual(["anxiety", "depression"]);
      expect(
        await codeOf(
          classifySemanticRemainder(
            { semanticRemainder: "חרדה" },
            harness(
              [{ kind: "raw", content: JSON.stringify({ matches: [{ slug: "nope", confidence: 0.5 }], abstained: false }) }],
              { catalog },
            ).deps,
          ),
        ),
      ).toBe("unknown_slug");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

describe("server-owned provenance", () => {
  it("returns the configured model version and the current prompt version", async () => {
    const r = await classifySemanticRemainder({ semanticRemainder: "חרדה" }, harness().deps);
    expect(r.modelVersion).toBe("fake-model-v9");
    expect(r.promptVersion).toBe("q2-semantic-v1");
    expect(r.promptVersion).toBe(LLM_SEMANTIC_PROMPT_VERSION);
  });

  it("rejects provider-supplied version fields instead of letting them override", async () => {
    const h = harness([
      {
        kind: "raw",
        content: JSON.stringify({
          matches: [{ slug: "anxiety", confidence: 0.9 }],
          abstained: false,
          modelVersion: "provider-claimed",
          promptVersion: "provider-claimed",
        }),
      },
    ]);
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "invalid_schema",
    );
  });

  it("no successful result contains 'unknown' or empty provenance", async () => {
    for (const content of [VALID, ABSTAIN]) {
      const r = await classifySemanticRemainder(
        { semanticRemainder: "חרדה" },
        harness([{ kind: "raw", content }]).deps,
      );
      expect(r.modelVersion).not.toBe("unknown");
      expect(r.promptVersion).not.toBe("unknown");
      expect(r.modelVersion.length).toBeGreaterThan(0);
      expect(r.promptVersion.length).toBeGreaterThan(0);
    }
    const empty = await classifySemanticRemainder({ semanticRemainder: " " }, harness().deps);
    expect(empty.modelVersion).toBe("fake-model-v9");
    expect(empty.promptVersion).toBe(LLM_SEMANTIC_PROMPT_VERSION);
  });

  it("fails clearly when the model configuration is missing or empty", () => {
    expect(() => fakeProviderConfig({ model: undefined })).toThrow();
    expect(() => fakeProviderConfig({ model: "" })).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Provider behavior + retry policy                                    */
/* ------------------------------------------------------------------ */

describe("provider behavior", () => {
  it("accepts a valid abstention as a success, not an error", async () => {
    const r = await classifySemanticRemainder(
      { semanticRemainder: "משהו" },
      harness([{ kind: "raw", content: ABSTAIN }]).deps,
    );
    expect(r.abstained).toBe(true);
    expect(r.matches).toEqual([]);
  });

  const deterministicFailures: Array<[string, string, string]> = [
    ["malformed provider output", '{"matches":[', "malformed_response"],
    ["prose-wrapped JSON", 'Sure!\n{"matches":[],"abstained":true}', "malformed_response"],
    ["empty provider response", "", "empty_response"],
    [
      "invalid confidence",
      JSON.stringify({ matches: [{ slug: "anxiety", confidence: 1.7 }], abstained: false }),
      "invalid_confidence",
    ],
    [
      "excessive match count",
      JSON.stringify({
        matches: [
          { slug: "anxiety", confidence: 0.9 },
          { slug: "depression", confidence: 0.8 },
          { slug: "trauma", confidence: 0.7 },
          { slug: "ocd_compulsions", confidence: 0.6 },
        ],
        abstained: false,
      }),
      "too_many_matches",
    ],
    [
      "abstention with matches",
      JSON.stringify({ matches: [{ slug: "anxiety", confidence: 0.9 }], abstained: true }),
      "conflicting_abstention",
    ],
    ["unsupported top level", JSON.stringify([{ slug: "anxiety" }]), "invalid_schema"],
  ];
  for (const [label, content, expected] of deterministicFailures) {
    it(`rejects ${label} without retrying`, async () => {
      const h = harness([{ kind: "raw", content }]);
      expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "משהו" }, h.deps))).toBe(
        expected,
      );
      expect(h.transport.callCount).toBe(1);
    });
  }

  it("deduplicates duplicate slugs keeping the highest confidence", async () => {
    const r = await classifySemanticRemainder(
      { semanticRemainder: "חרדה" },
      harness([
        {
          kind: "raw",
          content: JSON.stringify({
            matches: [
              { slug: "anxiety", confidence: 0.3 },
              { slug: "anxiety", confidence: 0.7 },
            ],
            abstained: false,
          }),
        },
      ]).deps,
    );
    expect(r.matches).toEqual([{ slug: "anxiety", confidence: 0.7 }]);
  });

  it("rejects an oversized provider response without retry", async () => {
    const h = harness([{ kind: "raw", content: VALID, byteLength: 999_999 }]);
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "provider_response_too_large",
    );
    expect(h.transport.callCount).toBe(1);
  });

  const transient: Array<[string, () => LlmSemanticError, string]> = [
    ["timeout", () => new LlmTimeoutError(), "provider_timeout"],
    ["network failure", () => new LlmProviderError(), "provider_error"],
    ["rate limit", () => new LlmRateLimitedError(), "provider_rate_limited"],
    ["server error", () => new LlmProviderServerError(), "provider_server_error"],
  ];
  for (const [label, make, expected] of transient) {
    it(`retries once after a ${label} and succeeds`, async () => {
      const h = harness([
        { kind: "throw", error: make() },
        { kind: "raw", content: VALID },
      ]);
      const r = await classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps);
      expect(r.matches.length).toBe(2);
      expect(h.transport.callCount).toBe(2);
      expect(h.logs.at(-1)?.retryCount).toBe(1);
    });

    it(`preserves the ${label} category after the retry also fails, with exactly 2 attempts`, async () => {
      const h = harness([{ kind: "throw", error: make() }]);
      expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
        expected,
      );
      expect(h.transport.callCount).toBe(2);
    });
  }

  it("never exceeds one retry even with a persistent transient failure", async () => {
    const h = harness([{ kind: "throw", error: new LlmTimeoutError() }]);
    await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps));
    expect(h.transport.callCount).toBeLessThanOrEqual(2);
  });

  it("does not retry a provider client error", async () => {
    const h = harness([
      { kind: "throw", error: new LlmSemanticError("provider_client_error", "401") },
    ]);
    expect(await codeOf(classifySemanticRemainder({ semanticRemainder: "חרדה" }, h.deps))).toBe(
      "provider_client_error",
    );
    expect(h.transport.callCount).toBe(1);
  });

  it("classifies exactly which categories are retryable", () => {
    for (const c of ["provider_error", "provider_timeout", "provider_rate_limited", "provider_server_error"] as const) {
      expect(isRetryableCode(c)).toBe(true);
    }
    for (const c of [
      "invalid_request",
      "input_too_large",
      "configuration_error",
      "catalog_error",
      "unknown_slug",
      "invalid_confidence",
      "conflicting_abstention",
      "too_many_matches",
      "invalid_schema",
      "malformed_response",
      "empty_response",
      "provider_response_too_large",
      "provider_client_error",
      "internal_error",
    ] as const) {
      expect(isRetryableCode(c)).toBe(false);
    }
  });

  it("makes no provider call for an empty remainder", async () => {
    const h = harness();
    await handleClassifyRequest(
      { method: "POST", text: async () => JSON.stringify({ semanticRemainder: "" }) },
      h.deps,
    );
    expect(h.transport.callCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* HTTP mapping + response / log safety                                */
/* ------------------------------------------------------------------ */

describe("HTTP mapping", () => {
  it("maps every stable category to a documented status", () => {
    expect(httpStatusForCode("invalid_request")).toBe(400);
    expect(httpStatusForCode("input_too_large")).toBe(413);
    expect(httpStatusForCode("provider_rate_limited")).toBe(429);
    expect(httpStatusForCode("configuration_error")).toBe(500);
    expect(httpStatusForCode("internal_error")).toBe(500);
    expect(httpStatusForCode("catalog_error")).toBe(503);
    expect(httpStatusForCode("provider_timeout")).toBe(504);
    for (const c of [
      "provider_error",
      "provider_server_error",
      "provider_client_error",
      "provider_response_too_large",
      "empty_response",
      "malformed_response",
      "invalid_schema",
      "unknown_slug",
      "invalid_confidence",
      "conflicting_abstention",
      "too_many_matches",
    ] as const) {
      expect(httpStatusForCode(c)).toBe(502);
    }
  });

  it("returns only the validated provider-independent result on success", async () => {
    const h = harness();
    const res = await handleClassifyRequest(
      { method: "POST", text: async () => JSON.stringify({ semanticRemainder: "חרדה" }) },
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "abstained",
      "matches",
      "modelVersion",
      "promptVersion",
    ]);
  });

  it("returns only a stable error category on failure", async () => {
    const h = harness([{ kind: "throw", error: new LlmTimeoutError("secret-key-abc leaked?") }]);
    const res = await handleClassifyRequest(
      { method: "POST", text: async () => JSON.stringify({ semanticRemainder: "חרדה" }) },
      h.deps,
    );
    expect(res).toEqual({ status: 504, body: { error: { code: "provider_timeout" } } });
  });
});

describe("response and log safety", () => {
  const SECRET = "fake-key-not-a-secret";
  const QUERY = "אני מרגיש חרדה נוראית בלילות";

  it("never exposes secrets, raw payloads or query text in responses or logs", async () => {
    const h = harness([{ kind: "raw", content: VALID }]);
    const res = await handleClassifyRequest(
      { method: "POST", text: async () => JSON.stringify({ semanticRemainder: QUERY }) },
      h.deps,
    );
    const dump = JSON.stringify({ res, logs: h.logs });
    for (const forbidden of [
      SECRET,
      QUERY,
      "Lovable-API-Key",
      "Authorization",
      "Bearer",
      "פחדים",
      "CATALOG",
      "REMAINDER",
      "problems",
      "problem_aliases",
      "therapist",
    ]) {
      expect(dump.includes(forbidden)).toBe(false);
    }
  });

  it("logs only safe operational fields", async () => {
    const h = harness();
    await classifySemanticRemainder({ semanticRemainder: QUERY }, h.deps);
    expect(h.logs).toHaveLength(1);
    expect(Object.keys(h.logs[0]!).sort()).toEqual([
      "abstained",
      "attempts",
      "durationMs",
      "event",
      "matchCount",
      "modelVersion",
      "promptVersion",
      "providerId",
      "responseSizeCategory",
      "retryCount",
      "status",
    ]);
    expect(h.logs[0]!.status).toBe("success");
  });

  it("logs a stable error category without query text on failure", async () => {
    const h = harness([{ kind: "raw", content: '{"matches":[' }]);
    await codeOf(classifySemanticRemainder({ semanticRemainder: QUERY }, h.deps));
    expect(h.logs.at(-1)?.errorCategory).toBe("malformed_response");
    expect(JSON.stringify(h.logs).includes(QUERY)).toBe(false);
  });

  it("never sends therapist data, filters or user identifiers to the provider", async () => {
    const h = harness();
    await classifySemanticRemainder({ semanticRemainder: QUERY }, h.deps);
    const sent = JSON.stringify(h.transport.lastRequest);
    expect(sent).toContain("REMAINDER");
    for (const forbidden of ["therapist_id", "full_name", "userId", "cityNames", "access_token", "email"]) {
      expect(sent.includes(forbidden)).toBe(false);
    }
  });
});