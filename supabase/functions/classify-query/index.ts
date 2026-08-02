/**
 * Phase Q2.2 — semantic classification server boundary.
 *
 * ONE purpose: classify `semanticRemainder` into validated canonical problem
 * slugs. It is NOT a generic LLM endpoint. Therapist-profile extraction and
 * therapist-profile generation are explicitly out of scope.
 *
 * NOT CONNECTED to production Unified Search. Production search remains fully
 * deterministic through the existing SemanticEngine.
 *
 * Public request contract:
 *   { "semanticRemainder": string }
 *
 * Public success contract:
 *   {
 *     matches: [{ slug, confidence }],
 *     abstained,
 *     modelVersion,
 *     promptVersion
 *   }
 *
 * Public failure contract:
 *   { error: { code: <stable category> } }
 *
 * Server-side secrets:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - OPENAI_API_KEY
 *   - OPENAI_MODEL
 *
 * OPENAI_API_KEY and OPENAI_MODEL are mandatory. There is no fallback model.
 *
 * The orchestration, validation, retry policy, provenance ownership, and HTTP
 * mapping live in the shared modules imported below. This file only wires the
 * real canonical-catalog dependency and the direct OpenAI transport.
 */

import { createClient } from "@supabase/supabase-js";
import { handleClassifyRequest, type ClassifyDeps } from "../../../src/lib/llm-classify-service.ts";
import { createOpenAiTransport } from "../../../src/lib/llm-gateway-transport.ts";
import { envFromRecord, loadProviderConfigFromEnv } from "../../../src/lib/llm-provider-config.ts";
import { SemanticEngine } from "../../../src/lib/semantic-engine.ts";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
      },
    });

  let deps: ClassifyDeps;

  try {
    const env = envFromRecord({
      OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
      OPENAI_MODEL: Deno.env.get("OPENAI_MODEL"),
    });

    const config = loadProviderConfigFromEnv(env);

    /*
     * Server-owned canonical catalog loaded through the real data-access path
     * used by the deterministic SemanticEngine.
     *
     * Callers cannot supply, extend, shrink, rename, or replace the catalog.
     * Catalog read failures propagate as catalog_error.
     */
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: {
        persistSession: false,
      },
    });

    deps = {
      config,
      transport: createOpenAiTransport(),

      // deno-lint-ignore no-explicit-any
      loadCatalog: () => SemanticEngine.loadCanonicalProblems(supabase as any),

      /*
       * The classify service limits records to safe operational metadata.
       * It does not include semanticRemainder, prompts, payloads, or secrets.
       */
      logger: (record) => console.log(JSON.stringify(record)),
    };
  } catch {
    /*
     * Configuration failures never expose secret-bearing error details.
     */
    return json(500, {
      error: {
        code: "configuration_error",
      },
    });
  }

  const { status, body } = await handleClassifyRequest(req, deps);

  return json(status, body);
});
