Tipulinks — Unified Search LLM integration update

Copy the files in this package to the same paths in the project.

Architecture:

1. Safety triage runs before catalog loading, semantic classification, LLM calls, eligibility or therapist reads.
2. Active canonical problems + problem_aliases are the normal semantic catalog.
3. Exact canonical names/aliases are authoritative deterministic evidence.
4. The server-side LLM receives only semanticRemainder + the canonical catalog and may output only canonical slugs.
5. LLM output is strictly JSON-schema constrained and validated locally against the server-owned canonical slug set.
6. If the LLM/config/provider/payload path fails, SemanticEngine.classify is used temporarily as deterministic fallback.
7. problem_intents is excluded from the new normal LLM catalog read and remains reachable only through the temporary fallback.
8. Urgent safety queries return urgent_help and do not perform therapist search.

Server configuration required for the LLM path:

- OPENAI_API_KEY
- OPENAI_MODEL

If either is absent, the temporary deterministic fallback is used.

Full typecheck/tests/build were intentionally left for Lovable. Static TypeScript/TSX syntax parsing passed for the project snapshot used to build this update.

Changed/new code files (17):

- src/lib/canonical-semantic-evidence.ts
- src/lib/canonical-semantic-evidence.test.ts
- src/lib/search-safety-triage.ts
- src/lib/search-safety-triage.test.ts
- src/lib/unified-semantic-classifier.server.ts
- src/lib/unified-semantic-classifier.server.test.ts
- src/lib/unified-safety-triage.test.ts
- src/lib/query-interpreter.functions.ts
- src/lib/query-interpreter.types.ts
- src/lib/unified-search-executor.ts
- src/lib/semantic-engine.ts
- src/lib/llm-provider-config.ts
- src/lib/llm-semantic-adapter.ts
- src/lib/llm-semantic-contract.ts
- src/lib/llm-semantic-prompt.ts
- src/lib/llm-architecture-isolation.test.ts
- src/routes/search.tsx
