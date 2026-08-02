/**
 * Phase Q2.2 — semantic classification server boundary.
 *
 * ONE purpose: classify `semanticRemainder` into validated canonical problem
 * slugs. It is NOT a generic LLM endpoint. Therapist-profile extraction
 * (`SemanticEngine.extractProfile`) and therapist-profile generation are
 * explicitly OUT OF SCOPE and are not implemented here; therapist records are
 * never read and never sent to a provider.
 *
 * NOT CONNECTED to production Unified Search. Production search remains fully
 * deterministic (`SemanticEngine`); nothing in the app calls this endpoint.
 *
 * Public request contract:   { "semanticRemainder": string }
 * Public success contract:   { matches: [{slug, confidence}], abstained,
 *                              modelVersion, promptVersion }
 * Public failure contract:   { error: { code: <stable category> } }
 *
 * Server-side secrets (values never in this repository):
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — canonical catalog read.
 *   - LOVABLE_API_KEY                         — provider credential.
 *   - LLM_SEMANTIC_MODEL (optional)           — model id override.
 *
 * The orchestration, validation, retry policy, provenance ownership and HTTP
 * mapping live in the shared, fully unit-tested modules imported below; this
 * file only wires real dependencies (catalog read + live transport).
 */

import { createClient } from "@supabase/supabase-js";
import {
  handleClassifyRequest,
  type ClassifyDeps,
} from "../../../src/lib/llm-classify-service.ts";
import { createGatewayTransport } from "../../../src/lib/llm-gateway-transport.ts";
import {
  envFromRecord,
  loadProviderConfigFromEnv,
} from "../../../src/lib/llm-provider-config.ts";
import { SemanticEngine } from "../../../src/lib/semantic-engine.ts";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  let deps: ClassifyDeps;
  try {
    const env = envFromRecord({
      LOVABLE_API_KEY: Deno.env.get("LOVABLE_API_KEY"),
      LLM_SEMANTIC_MODEL: Deno.env.get("LLM_SEMANTIC_MODEL"),
    });
    const config = loadProviderConfigFromEnv(env);
    // Server-owned canonical catalog: loaded through the REAL data-access
    // path used by the deterministic engine. Callers cannot supply, extend,
    // shrink or rename it. Read errors propagate as `catalog_error`.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    deps = {
      config,
      transport: createGatewayTransport(),
      // deno-lint-ignore no-explicit-any
      loadCatalog: () => SemanticEngine.loadCanonicalProblems(supabase as any),
      logger: (record) => console.log(JSON.stringify(record)),
    };
  } catch {
    // Configuration failures never expose secret-bearing details.
    return json(500, { error: { code: "configuration_error" } });
  }

  const { status, body } = await handleClassifyRequest(req, deps);
  return json(status, body);
});