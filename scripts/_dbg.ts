import { createClient } from "@supabase/supabase-js";
import { SemanticEngine } from "../src/lib/semantic-engine";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
const [aRes, iRes, pRes] = await Promise.all([
  sb.from("problem_aliases").select("problem_id, alias").limit(2000),
  sb.from("problem_intents").select("problem_slug, intent_text").limit(2000),
  sb.from("problems").select("id, slug, name:name_he"),
]);
const slugById = new Map((pRes.data??[]).map((p:any)=>[String(p.id), p.slug]));
console.log("--- loneliness aliases:");
for (const a of aRes.data??[]) if (slugById.get(String((a as any).problem_id))==="loneliness") console.log(" ",(a as any).alias);
console.log("--- loneliness intents:");
for (const i of iRes.data??[]) if ((i as any).problem_slug==="loneliness") console.log(" ",(i as any).intent_text);
console.log("--- depression aliases (partial):");
let d=0; for (const a of aRes.data??[]) if (slugById.get(String((a as any).problem_id))==="depression"){ console.log(" ",(a as any).alias); if(++d>10) break; }
console.log("\n=== TEST QUERIES ===");
for (const q of ["דכאוווון","OCD וחרדה שמשתקים אותי בעבודה","אני כל הזמן בודקת אם נעלתי את הדלת ושכבתי את הגז","אבל"]) {
  const r = await SemanticEngine.classify(q, sb as any);
  console.log(q, "=>", r);
}
