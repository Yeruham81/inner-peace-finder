import { createClient } from "@supabase/supabase-js";
import { flexibleHebrewMatch, lightNormalizeHebrew, tokenizeHebrew } from "../src/lib/hebrew-normalizer";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
const [aRes, iRes, pRes] = await Promise.all([
  sb.from("problem_aliases").select("problem_id, alias").limit(3000),
  sb.from("problem_intents").select("problem_slug, intent_text").limit(3000),
  sb.from("problems").select("id, slug, name:name_he"),
]);
const slugById = new Map((pRes.data??[]).map((p:any)=>[String(p.id), p.slug]));
const query = "OCD וחרדה שמשתקים אותי בעבודה";
console.log("query normalized:", lightNormalizeHebrew(query));
console.log("query tokens:", tokenizeHebrew(query));
console.log("--- matches producing loneliness ---");
for (const a of aRes.data??[]) {
  if (slugById.get(String((a as any).problem_id)) !== "loneliness") continue;
  const al = (a as any).alias;
  if (flexibleHebrewMatch(al, query)) console.log("ALIAS:", al, "→ norm:", lightNormalizeHebrew(al), "tokens:", tokenizeHebrew(al));
}
for (const i of iRes.data??[]) {
  if ((i as any).problem_slug !== "loneliness") continue;
  const it = (i as any).intent_text;
  if (flexibleHebrewMatch(it, query)) console.log("INTENT:", it, "→ norm:", lightNormalizeHebrew(it), "tokens:", tokenizeHebrew(it));
}
