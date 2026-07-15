import { createClient } from "@supabase/supabase-js";
import { SemanticEngine, normalizeText, tokenize, matchesText } from "../src/lib/semantic-engine";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);

const inputs = [
  "אני מטפל בדיכאון ובדכאונות ממושכים.",
  "אני מטפל בחרדה ומעבר לחצים.",
  "אני עוסק בטיפול זוגי ובזוגיות.",
  "אני מלווה משברי חיים והתמודדויות נפשיות.",
];

async function main() {
  const [pRes, aRes] = await Promise.all([
    sb.from("problems").select("id, slug, name:name_he"),
    sb.from("problem_aliases").select("problem_id, alias"),
  ]);
  const problems = pRes.data!;
  const aliases = aRes.data!;
  const slugById = new Map(problems.map(p => [String(p.id), p.slug]));

  for (const text of inputs) {
    console.log("\n=========================");
    console.log("INPUT:", text);
    console.log("norm :", normalizeText(text));
    console.log("toks :", tokenize(text));

    // Find any alias/name that matches
    const nameHits = problems.filter(p => p.name && matchesText(p.name, text));
    const aliasHits = aliases.filter(a => a.alias && matchesText(a.alias, text));
    console.log(`name hits (${nameHits.length}):`);
    nameHits.forEach(p => console.log(`  - slug=${p.slug} name="${p.name}"`));
    console.log(`alias hits (${aliasHits.length}):`);
    aliasHits.slice(0,20).forEach(a => {
      const slug = slugById.get(String(a.problem_id));
      console.log(`  - slug=${slug} alias="${a.alias}"`);
    });

    const profile = await SemanticEngine.extractProfile(text, sb as any);
    console.log("→ semantic_profile:", profile);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
