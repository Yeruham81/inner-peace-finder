/**
 * Global test preload.
 *
 * The unified search server path reads `OPENAI_API_KEY` / `OPENAI_MODEL` from
 * `process.env` and, when both are present, performs a REAL OpenAI request.
 * In the sandbox/CI those secrets are injected, which made suite runs network
 * dependent, slow and non-deterministic (the LLM route bypasses the
 * deterministic `problem_intents` fallback the tests assert on).
 *
 * Tests that need the LLM boundary inject an explicit config + fake transport,
 * so removing the ambient credentials here keeps every test offline without
 * touching production behaviour.
 */
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
