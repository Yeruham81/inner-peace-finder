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
    { id: "1", slug: "self_identity", name: "דימוי עצמי, ערך עצמי וזהות" },
    { id: "2", slug: "emotional_regulation", name: "ויסות רגשי, כעס והצפה" },
    { id: "3", slug: "depression", name: "דיכאון ומצב רוח ירוד" },
  ],
  aliases: [
    { problem_id: "1", alias: "משבר זהות" },
    { problem_id: "2", alias: "הצפה רגשית" },
  ],
  intents: [],
};

async function slugs(text: string): Promise<string[]> {
  const p = await SemanticEngine.extractProfile(text, makeSb(vocab));
  return p.map((x) => x.slug);
}

describe("extractProfile — proximity + anchor-heavy guard", () => {
  it("rejects משבר זהות when tokens only co-occur far apart", async () => {
    const text = "אני מלווה מטופלים בהתמודדות עם משברים שונים ובעבודה על תחושת זהות עצמית. אני מטפלת מזה שנים רבות.";
    expect(await slugs(text)).not.toContain("self_identity");
  });

  it("rejects הצפה רגשית when tokens are only incidentally near each other", async () => {
    const text = "אני מציעה עזרה במצוקה רגשית עמוקה והצפה של רגשות שקשה להכיל בכוחות עצמך.";
    expect(await slugs(text)).not.toContain("emotional_regulation");
  });

  it("accepts self_identity when the approved phrase משבר זהות appears verbatim", async () => {
    const text = "אני מטפל במשבר זהות אצל מבוגרים ובני נוער בשנים האחרונות.";
    expect(await slugs(text)).toContain("self_identity");
  });

  it("accepts emotional_regulation when הצפה רגשית appears verbatim", async () => {
    const text = "אני מטפל בהצפה רגשית ובקשיים בוויסות רגשי אצל מבוגרים.";
    expect(await slugs(text)).toContain("emotional_regulation");
  });

  it("still accepts an explicit single-token treatment domain (דיכאון)", async () => {
    const text = "אני מטפל בדיכאון ובדכאונות ממושכים אצל מבוגרים ובני נוער.";
    expect(await slugs(text)).toContain("depression");
  });
});
