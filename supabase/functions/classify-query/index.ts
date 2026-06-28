// Placeholder Edge Function for future LLM-backed semantic classification.
//
// Not wired into the search pipeline yet. The pipeline currently calls
// `classifyQuery()` from `src/lib/semantic-classifier.ts`, which returns a
// rule-based mock. When an LLM provider is selected we will:
//   1. Add provider secrets (e.g. OPENAI_API_KEY) via Lovable Cloud.
//   2. Implement the call inside this function, returning the same shape:
//        { matches: [{ slug, confidence }, ...], source: "openai" }
//   3. Flip `classifyQuery()` to POST here on cache miss, falling back to
//      the mock on any error so search never breaks.
//
// DO NOT add an API key or external HTTP call in this commit.

// deno-lint-ignore-file no-unused-vars

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // TODO(semantic-llm): validate body, look up active provider, call LLM,
  // map response to { matches: [{ slug, confidence }], source }.
  // For now this endpoint is intentionally inert.
  return new Response(
    JSON.stringify({
      matches: [],
      source: "placeholder",
      note: "classify-query is a placeholder; LLM integration not yet enabled",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});