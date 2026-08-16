/**
 * Test-only scripted transport for the server semantic boundary.
 *
 * It performs NO network calls and needs NO credentials: it replays scripted
 * raw provider text or throws typed provider errors, so the REAL server
 * orchestration (validation, catalog ownership, provenance, retry, parsing)
 * is exercised end to end offline.
 */

import type { LlmSemanticError } from "../llm-semantic-contract";
import { createProviderConfig, type LlmProviderConfig } from "../llm-provider-config";
import type { LlmTransport, LlmTransportRequest, LlmTransportResult } from "../llm-gateway-transport";

export type ScriptedStep =
  | { kind: "raw"; content: string; byteLength?: number; usage?: LlmTransportResult["usage"] }
  | { kind: "throw"; error: LlmSemanticError };

export type ScriptedTransport = LlmTransport & {
  readonly callCount: number;
  readonly lastRequest: LlmTransportRequest | null;
};

/** Steps are consumed in order; the last step repeats if attempts exceed it. */
export function createScriptedTransport(steps: ScriptedStep[]): ScriptedTransport {
  let calls = 0;
  let lastRequest: LlmTransportRequest | null = null;
  return {
    providerId: "scripted",
    get callCount() {
      return calls;
    },
    get lastRequest() {
      return lastRequest;
    },
    async request(input: LlmTransportRequest): Promise<LlmTransportResult> {
      lastRequest = input;
      const step = steps[Math.min(calls, steps.length - 1)]!;
      calls += 1;
      if (step.kind === "throw") throw step.error;
      return {
        rawContent: step.content,
        byteLength: step.byteLength ?? new TextEncoder().encode(step.content).length,
        ...(step.usage ? { usage: step.usage } : {}),
      };
    },
  };
}

/** Safe fake configuration — never a real credential, never a real endpoint call. */
export function fakeProviderConfig(overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig {
  return createProviderConfig({
    providerId: "scripted",
    endpoint: "https://example.invalid/v1/responses",
    model: "fake-model-v9",
    apiKey: "fake-key-not-a-secret",
    ...overrides,
  });
}
