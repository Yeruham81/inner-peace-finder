import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
const { data: problems } = await sb.from("problems").select("id, slug, name:name_he");
const { data: aliases } = await sb.from("problem_aliases").select("problem_id, alias");
const bySlug: Record<string, string> = {};
for (const p of problems!) bySlug[String(p.id)] = p.slug;
for (const slug of ["identity_crisis","emotional_flooding","emotional_overwhelm"]) {
  const p = problems!.find(x=>x.slug===slug);
  if (!p) { console.log("NO SLUG",slug); continue; }
  console.log("\n===", slug, "name=", p.name);
  const list = aliases!.filter(a=>String(a.problem_id)===String(p.id));
  for (const a of list) console.log("  alias:", a.alias);
}
