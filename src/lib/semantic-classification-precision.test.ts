import { describe, expect, it } from "bun:test";

import { SemanticEngine } from "./semantic-engine";
import { createFakeSupabase } from "./test-support/fake-supabase";

function catalogClient() {
  return createFakeSupabase({
    problems: [
      { id: "identity", slug: "self_identity", name: "דימוי עצמי וזהות" },
      {
        id: "performance",
        slug: "performance_functioning",
        name: "עבודה, לימודים ותפקוד",
      },
      { id: "grief", slug: "grief_loss", name: "אבל ואובדן" },
    ],
    problem_aliases: [
      { problem_id: "identity", alias: "קשיי זהות" },
      { problem_id: "identity", alias: "קשיים בדימוי העצמי" },
      { problem_id: "identity", alias: "קשיים בזהות העצמית" },
      { problem_id: "performance", alias: "שחיקה בעבודה" },
      { problem_id: "performance", alias: "שחיקה מקצועית" },
    ],
    problem_intents: [],
  }) as unknown as Parameters<typeof SemanticEngine.classify>[1];
}

describe("semantic classification precision", () => {
  it("does not classify sleep difficulties from the generic word קשיי", async () => {
    const matches = await SemanticEngine.classify("קשיי שינה", catalogClient());
    expect(matches).toEqual([]);
  });

  it("accepts an exact canonical alias for a normally profile-only domain", async () => {
    const matches = await SemanticEngine.classify("שחיקה בעבודה", catalogClient());
    expect(matches[0]?.slug).toBe("performance_functioning");
  });

  it("does not confuse suicidal wording with grief and loss", async () => {
    const matches = await SemanticEngine.classify("שחיקה בעבודה ומחשבות אובדניות", catalogClient());
    expect(matches.map((match) => match.slug)).toContain("performance_functioning");
    expect(matches.map((match) => match.slug)).not.toContain("grief_loss");
  });
});
