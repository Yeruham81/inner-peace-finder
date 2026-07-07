// Deterministic runner for Phase 17C.1 vocabulary evaluation.
// Uses the live publishable Data API to fetch vocab, then executes
// SemanticEngine.classify against CLASSIFICATION_CASES.
import { createClient } from "@supabase/supabase-js";
import { SemanticEngine } from "../src/lib/semantic-engine";
import {
  CLASSIFICATION_CASES,
  PROFILE_EXTRACTION_CASES,
} from "../src/lib/semantic-evaluation-corpus";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
const sb = createClient(url, key);

type Row = {
  input: string;
  expected: string[];
  actual: string[];
  category: string;
  top1: boolean;
  top3: boolean;
  top5: boolean;
  pass: boolean; // subset within top-3 (engine returns 3)
  confTop: number;
};

async function run() {
  const rows: Row[] = [];
  for (const c of CLASSIFICATION_CASES) {
    // Bypass MAX=3 cap by calling twice? No — engine returns top 3. We
    // approximate top-5 by re-scoring; simpler: since engine caps at 3, we
    // report top-1/top-3 fairly; top-5 falls back to top-3.
    const res = await SemanticEngine.classify(c.input, sb as any);
    const slugs = res.map((r) => r.slug);
    const setA = new Set(slugs);
    const subsetOk = c.expected.every((s) => setA.has(s));
    rows.push({
      input: c.input,
      expected: c.expected,
      actual: slugs,
      category: c.category ?? "unknown",
      top1: c.expected.length > 0 && slugs[0] === c.expected[0],
      top3: c.expected.length > 0 && slugs.slice(0, 3).includes(c.expected[0]),
      top5: c.expected.length > 0 && slugs.slice(0, 5).includes(c.expected[0]),
      pass: c.expected.length === 0 ? slugs.length === 0 || (c as any).allowLowConfidence : subsetOk,
      confTop: res[0]?.confidence ?? 0,
    });
  }

  // ---------- profile ----------
  const profRows: { pass: boolean; extra: number; expected: string[]; actual: string[] }[] = [];
  for (const p of PROFILE_EXTRACTION_CASES) {
    const prof = await SemanticEngine.extractProfile(p.input, sb as any);
    const slugs = prof.map((e) => e.slug);
    const setA = new Set(slugs);
    profRows.push({
      pass: p.expected.every((s) => setA.has(s)),
      extra: slugs.length - p.expected.length,
      expected: p.expected,
      actual: slugs,
    });
  }

  // Aggregates
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const top1 = rows.filter((r) => r.top1).length;
  const top3 = rows.filter((r) => r.top3).length;
  const top5 = rows.filter((r) => r.top5).length;

  const byCat = new Map<string, { total: number; pass: number; top1: number; top3: number }>();
  for (const r of rows) {
    const b = byCat.get(r.category) ?? { total: 0, pass: 0, top1: 0, top3: 0 };
    b.total++;
    if (r.pass) b.pass++;
    if (r.top1) b.top1++;
    if (r.top3) b.top3++;
    byCat.set(r.category, b);
  }

  const pct = (n: number, d: number) => d ? ((n / d) * 100).toFixed(1) + "%" : "n/a";

  console.log("=== CLASSIFICATION ===");
  console.log(`Total: ${passed}/${total} pass (${pct(passed, total)})`);
  console.log(`Top-1: ${top1}/${total} (${pct(top1, total)})`);
  console.log(`Top-3: ${top3}/${total} (${pct(top3, total)})`);
  console.log(`Top-5: ${top5}/${total} (${pct(top5, total)})  [engine caps at 3]`);
  console.log("\nBy category (pass | top1 | top3):");
  for (const [cat, b] of Array.from(byCat.entries()).sort()) {
    console.log(`  ${cat.padEnd(20)} ${b.pass}/${b.total} ${pct(b.pass, b.total).padStart(6)} | top1 ${pct(b.top1, b.total).padStart(6)} | top3 ${pct(b.top3, b.total).padStart(6)}`);
  }

  // Per-slug recall (expected slug appears in top-3)
  const slugRecall = new Map<string, { total: number; hit: number }>();
  for (const r of rows) {
    if (r.expected.length === 0) continue;
    const s = r.expected[0];
    const b = slugRecall.get(s) ?? { total: 0, hit: 0 };
    b.total++;
    if (r.top3) b.hit++;
    slugRecall.set(s, b);
  }
  console.log("\nPer-slug top-3 recall (worst first):");
  const sorted = Array.from(slugRecall.entries()).sort((a, b) => a[1].hit / a[1].total - b[1].hit / b[1].total);
  for (const [slug, b] of sorted) {
    console.log(`  ${slug.padEnd(28)} ${b.hit}/${b.total}  ${pct(b.hit, b.total)}`);
  }

  // Failures
  console.log("\n--- FAILURES ---");
  for (const r of rows.filter((x) => !x.pass)) {
    console.log(`[${r.category}] "${r.input}" exp=${JSON.stringify(r.expected)} got=${JSON.stringify(r.actual)} conf=${r.confTop}`);
  }

  console.log("\n=== PROFILE EXTRACTION ===");
  const pPass = profRows.filter((r) => r.pass).length;
  console.log(`${pPass}/${profRows.length} pass (${pct(pPass, profRows.length)})`);
  const avgExtra = profRows.reduce((s, r) => s + r.actual.length, 0) / profRows.length;
  console.log(`Avg extracted slugs per profile: ${avgExtra.toFixed(1)}`);

  // JSON summary for later comparison
  const summary = {
    classification: { total, passed, top1, top3, top5, byCategory: Object.fromEntries(byCat) },
    profile: { total: profRows.length, passed: pPass, avgExtracted: avgExtra },
  };
  await import("fs/promises").then((fs) => fs.writeFile(process.argv[2] ?? "/tmp/eval.json", JSON.stringify(summary, null, 2)));
}

run().catch((e) => { console.error(e); process.exit(1); });
