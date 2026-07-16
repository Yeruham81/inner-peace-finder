import { createClient } from "@supabase/supabase-js";
import { normalizeText, tokenize, matchesText, SemanticEngine } from "../src/lib/semantic-engine";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
const { data: problems } = await sb.from("problems").select("id, slug, name:name_he");
const { data: aliases } = await sb.from("problem_aliases").select("problem_id, alias");
const slugById = new Map(problems!.map(p=>[String(p.id), p.slug]));

// Try a set of therapist description snippets likely to trigger these FPs
const inputs = [
  "אני מציעה תהליך של הבנה עצמית וצמיחה אישית.",
  "מטפלת בקשיים רגשיים ומצוקה נפשית עמוקה.",
  "אני מלווה תהליכים של הבנה עצמית, צמיחה וריפוי.",
  "עוזרת להתמודד עם מצוקה רגשית והצפה של רגשות.",
];

for (const text of inputs) {
  console.log("\n=========================");
  console.log("INPUT:", text);
  console.log("norm :", normalizeText(text));
  const toks = tokenize(text);
  console.log("toks :", toks);
  const targetSlugs = ["identity_crisis","emotional_overwhelm"];
  for (const slug of targetSlugs) {
    const p = problems!.find(x=>x.slug===slug)!;
    const nameHit = matchesText(p.name, text);
    const alist = aliases!.filter(a=>String(a.problem_id)===String(p.id));
    const aHits = alist.filter(a=>matchesText(a.alias, text));
    console.log(`  [${slug}] name="${p.name}" nameHit=${nameHit}`);
    for (const a of aHits) console.log(`    alias HIT: "${a.alias}"`);
  }
  const profile = await SemanticEngine.extractProfile(text, sb as any);
  console.log("→ profile:", profile.map(p=>p.slug));
}
