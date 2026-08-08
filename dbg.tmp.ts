import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const sb = createClient(url, key);
const { runUnifiedSearch } = await import("./src/lib/query-interpreter.functions");
const out = await runUnifiedSearch({ query: "", explicit: {}, limit: 5 }, sb as any);
console.log("emptyReason", out.emptyReason, "results", out.results.length, "browseAll", (out.plan as any).browseAll);
