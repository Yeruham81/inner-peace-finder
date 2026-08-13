import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { describe, expect, it } from "bun:test";
import { SemanticEngine } from "./semantic-engine";

// Minimal fake Supabase client — only covers the three tables read by
// fetchVocabulary(). Keeps the vocabulary tiny so the test isolates the
// extraction acceptance logic instead of DB behavior.
function makeSb(rows: {
  problems: { id: string; slug: string; name: string }[];
  aliases: { problem_id: string; alias: string }[];
  intents: { problem_slug: string; intent_text: string }[];
}) {
  const map: Record<string, unknown[]> = {
    problems: rows.problems.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
    problem_aliases: rows.aliases,
    problem_intents: rows.intents,
  };
  return {
    from: (t: string) => ({
      select: () => Promise.resolve({ data: map[t] ?? [] }),
    }),
  } as unknown as SupabaseClient<Database>;
}

const vocab = {
  problems: [
    { id: "1", slug: "identity_crisis", name: "משבר זהות" },
    { id: "2", slug: "emotional_overwhelm", name: "הצפה רגשית" },
    { id: "3", slug: "depression", name: "דיכאון" },
  ],
  aliases: [],
  intents: [],
};

async function slugs(text: string): Promise<string[]> {
  const p = await SemanticEngine.extractProfile(text, makeSb(vocab));
  return p.map((x) => x.slug);
}

describe("extractProfile — proximity + anchor-heavy guard", () => {
  it("rejects משבר זהות when tokens co-occur far apart", async () => {
    const text = "אני מלווה מטופלים בהתמודדות עם משברים שונים ובעבודה על תחושת זהות עצמית. אני מטפלת מזה שנים רבות.";
    expect(await slugs(text)).not.toContain("identity_crisis");
  });

  it("rejects הצפה רגשית when tokens are only incidentally near each other", async () => {
    const text = "אני מציעה עזרה במצוקה רגשית עמוקה והצפה של רגשות שקשה להכיל בכוחות עצמך.";
    expect(await slugs(text)).not.toContain("emotional_overwhelm");
  });

  it("accepts משבר זהות when the full phrase appears verbatim", async () => {
    const text = "אני מטפל במשבר זהות אצל מבוגרים ובני נוער בשנים האחרונות.";
    expect(await slugs(text)).toContain("identity_crisis");
  });

  it("accepts הצפה רגשית when the full phrase appears verbatim", async () => {
    const text = "אני מטפל בהצפה רגשית ובקשיים בוויסות רגשי אצל מבוגרים.";
    expect(await slugs(text)).toContain("emotional_overwhelm");
  });

  it("still accepts an explicit single-token treatment domain (דיכאון)", async () => {
    const text = "אני מטפל בדיכאון ובדכאונות ממושכים אצל מבוגרים ובני נוער.";
    expect(await slugs(text)).toContain("depression");
  });
});
