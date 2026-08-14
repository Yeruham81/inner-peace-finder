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
      { id: "sleep", slug: "sleep_difficulties", name: "קשיי שינה" },
    ],
    problem_aliases: [
      { problem_id: "identity", alias: "קשיי זהות" },
      { problem_id: "identity", alias: "קשיים בדימוי העצמי" },
      { problem_id: "identity", alias: "קשיים בזהות העצמית" },
      { problem_id: "identity", alias: "חוסר ביטחון עצמי" },
      { problem_id: "performance", alias: "שחיקה בעבודה" },
      { problem_id: "performance", alias: "שחיקה מקצועית" },
      { problem_id: "performance", alias: "חוסר ביטחון מקצועי" },
      { problem_id: "sleep", alias: "הפרעות שינה" },
      { problem_id: "sleep", alias: "נדודי שינה" },
      { problem_id: "sleep", alias: "קושי להירדם" },
    ],
    problem_intents: [{ problem_slug: "sleep_difficulties", intent_text: "אני מתעורר הרבה בלילה" }],
  }) as unknown as Parameters<typeof SemanticEngine.classify>[1];
}

describe("semantic classification precision", () => {
  it("classifies the exact canonical sleep domain instead of matching generic קשיי", async () => {
    const matches = await SemanticEngine.classify("קשיי שינה", catalogClient());
    expect(matches.map((match) => match.slug)).toEqual(["sleep_difficulties"]);
  });

  it("recognizes precise sleep aliases and intents", async () => {
    for (const query of ["הפרעות שינה", "נדודי שינה", "קושי להירדם", "אני מתעורר הרבה בלילה"]) {
      const matches = await SemanticEngine.classify(query, catalogClient());
      expect(matches[0]?.slug).toBe("sleep_difficulties");
    }
  });

  it("accepts an exact canonical alias for a normally profile-only domain", async () => {
    const matches = await SemanticEngine.classify("שחיקה בעבודה", catalogClient());
    expect(matches[0]?.slug).toBe("performance_functioning");
  });

  it("drops fragment-only competitors when an alias explains the whole query", async () => {
    const matches = await SemanticEngine.classify("חוסר ביטחון מקצועי", catalogClient());
    expect(matches.map((match) => match.slug)).toEqual(["performance_functioning"]);
  });

  it("does not confuse suicidal wording with grief and loss", async () => {
    const matches = await SemanticEngine.classify("שחיקה בעבודה ומחשבות אובדניות", catalogClient());
    expect(matches.map((match) => match.slug)).toContain("performance_functioning");
    expect(matches.map((match) => match.slug)).not.toContain("grief_loss");
  });

  it("never emits historical inactive problem slugs", async () => {
    const client = createFakeSupabase({
      problems: [
        { id: "active", slug: "anxiety", name: "חרדה ופחדים", is_active: true },
        { id: "inactive", slug: "social_anxiety", name: "חרדה חברתית", is_active: false },
      ],
      problem_aliases: [
        { problem_id: "active", alias: "חרדה חברתית" },
        { problem_id: "inactive", alias: "חרדה חברתית" },
      ],
      problem_intents: [],
    }) as unknown as Parameters<typeof SemanticEngine.classify>[1];
    const matches = await SemanticEngine.classify("חרדה חברתית", client);
    expect(matches.map((match) => match.slug)).toEqual(["anxiety"]);
  });
});
