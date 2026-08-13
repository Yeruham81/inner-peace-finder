// Phase 17C.4A — Ontology Validation & Conflict Mapping (analysis only).
// Measurement-only: reads live vocab, runs CLASSIFICATION_CASES through
// SemanticEngine.classify, and emits a markdown + JSON report describing
// the current ontology's shape, conflicts, and merge candidates.
//
// Does not modify DB, vocab, engine, scoring, matcher, normalization.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { writeFile, mkdir } from "fs/promises";
import { SemanticEngine } from "../src/lib/semantic-engine";
import { CLASSIFICATION_CASES, PROFILE_EXTRACTION_CASES } from "../src/lib/semantic-evaluation-corpus";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
const sb = createClient<Database>(url, key);

/* ---------- Manually curated hypothesis sets (analysis input) ---------- */
const MERGE_CANDIDATES: [string, string][] = [
  ["addiction", "substance_use"],
  ["addiction", "behavioral_addiction"],
  ["grief_loss", "loss"],
  ["grief_loss", "bereavement"],
  ["burnout", "burnout_depression"],
  ["self_identity", "identity_crisis"],
  ["self_identity", "low_self_esteem"],
  ["identity_crisis", "low_self_esteem"],
  ["trauma", "complex_trauma"],
  ["trauma", "childhood_trauma"],
  ["anxiety", "generalized_anxiety"],
  ["depression", "low_mood"],
  ["eating_body", "binge_eating"],
  ["eating_body", "body_image"],
  ["life_transitions", "major_life_change"],
  ["family_parenting", "parenting_stress"],
  ["family_parenting", "parent_child_conflict"],
];

const UMBRELLA_SLUGS = [
  "communication_expression",
  "neurodiversity",
  "somatic",
  "performance_functioning",
  "emotional_regulation",
  "family_parenting",
  "burnout_depression",
];

// Same map the engine encodes (mirror for reporting; do NOT edit engine).
const KNOWN_PARENT_OF: Record<string, string> = {
  panic: "anxiety",
  social_anxiety: "anxiety",
  health_anxiety: "anxiety",
  intrusive_thoughts: "ocd_compulsions",
  childhood_trauma: "trauma",
  ptsd: "trauma",
  body_image: "eating_body",
  low_mood: "depression",
};

type SlugStats = {
  slug: string;
  aliasCount: number;
  intentCount: number;
  expectedTotal: number; // cases where slug is the primary expected
  top1Hit: number;
  top3Hit: number;
  timesReturned: number; // # of cases where slug appears in actual
  timesReturnedCorrect: number; // when it was actually expected
  timesReturnedWrong: number; // when it wasn't
  falseNegatives: number;
  confusedWith: Map<string, number>; // slug returned instead of this one
  avgTopConfWhenReturned: number;
};

function pct(n: number, d: number) {
  return d ? ((n / d) * 100).toFixed(1) + "%" : "n/a";
}

async function main() {
  // ---- Vocabulary (for alias/intent counts) ----
  const [pr, ar, ir] = await Promise.all([
    sb.from("problems").select("id, slug, name:name_he"),
    sb.from("problem_aliases").select("problem_id, alias"),
    sb.from("problem_intents").select("problem_slug, intent_text"),
  ]);
  const problems = (pr.data ?? []) as { id: string; slug: string; name: string | null }[];
  const aliases = (ar.data ?? []) as { problem_id: string; alias: string }[];
  const intents = (ir.data ?? []) as { problem_slug: string; intent_text: string }[];
  const slugById = new Map(problems.map((p) => [String(p.id), p.slug]));
  const aliasCountBySlug = new Map<string, number>();
  for (const a of aliases) {
    const s = slugById.get(String(a.problem_id));
    if (!s) continue;
    aliasCountBySlug.set(s, (aliasCountBySlug.get(s) ?? 0) + 1);
  }
  const intentCountBySlug = new Map<string, number>();
  for (const i of intents) {
    if (!i.problem_slug) continue;
    intentCountBySlug.set(i.problem_slug, (intentCountBySlug.get(i.problem_slug) ?? 0) + 1);
  }

  // ---- Run corpus ----
  type Row = {
    input: string;
    category: string;
    expected: string[];
    actual: string[];
    confs: number[];
    allowLow: boolean;
  };
  const rows: Row[] = [];
  for (const c of CLASSIFICATION_CASES) {
    const res = await SemanticEngine.classify(c.input, sb);
    rows.push({
      input: c.input,
      category: c.category ?? "unknown",
      expected: c.expected,
      actual: res.map((r) => r.slug),
      confs: res.map((r) => r.confidence),
      allowLow: !!c.allowLowConfidence,
    });
  }

  // ---- Per-slug stats ----
  const allSlugs = new Set<string>();
  problems.forEach((p) => allSlugs.add(p.slug));
  rows.forEach((r) => {
    r.expected.forEach((s) => allSlugs.add(s));
    r.actual.forEach((s) => allSlugs.add(s));
  });

  const stats = new Map<string, SlugStats>();
  const init = (s: string): SlugStats => {
    const v: SlugStats = {
      slug: s,
      aliasCount: aliasCountBySlug.get(s) ?? 0,
      intentCount: intentCountBySlug.get(s) ?? 0,
      expectedTotal: 0,
      top1Hit: 0,
      top3Hit: 0,
      timesReturned: 0,
      timesReturnedCorrect: 0,
      timesReturnedWrong: 0,
      falseNegatives: 0,
      confusedWith: new Map(),
      avgTopConfWhenReturned: 0,
    };
    stats.set(s, v);
    return v;
  };
  allSlugs.forEach(init);

  const topConfSum = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const primary = r.expected[0];
    const expectedSet = new Set(r.expected);
    const actualSet = new Set(r.actual);
    if (primary) {
      const s = stats.get(primary)!;
      s.expectedTotal++;
      if (r.actual[0] === primary) s.top1Hit++;
      if (r.actual.slice(0, 3).includes(primary)) s.top3Hit++;
      if (!actualSet.has(primary)) s.falseNegatives++;
    }
    // For every returned slug in top-3:
    r.actual.forEach((got, idx) => {
      const s = stats.get(got)!;
      s.timesReturned++;
      if (expectedSet.has(got)) s.timesReturnedCorrect++;
      else s.timesReturnedWrong++;
      if (idx === 0) {
        const b = topConfSum.get(got) ?? { sum: 0, n: 0 };
        b.sum += r.confs[0] ?? 0;
        b.n++;
        topConfSum.set(got, b);
      }
      // Confusion: when got is returned but the expected primary is different
      // and primary is not present anywhere in actual, credit "got" as the
      // confusion target for "primary".
      if (primary && got !== primary && !actualSet.has(primary)) {
        const s2 = stats.get(primary)!;
        s2.confusedWith.set(got, (s2.confusedWith.get(got) ?? 0) + 1);
      }
    });
  }
  for (const [slug, b] of topConfSum) {
    const s = stats.get(slug)!;
    s.avgTopConfWhenReturned = b.n ? b.sum / b.n : 0;
  }

  // ---- Confusion matrix / pairwise ranking ----
  type Pair = { a: string; b: string; count: number; direction: string };
  const pairMap = new Map<string, Pair>();
  for (const r of rows) {
    const primary = r.expected[0];
    if (!primary) continue;
    const actualSet = new Set(r.actual);
    if (actualSet.has(primary)) continue; // no confusion
    for (const got of r.actual) {
      const key = primary < got ? `${primary}||${got}` : `${got}||${primary}`;
      const p = pairMap.get(key) ?? { a: primary, b: got, count: 0, direction: `${got} outranks ${primary}` };
      p.count++;
      pairMap.set(key, p);
    }
  }
  const conflictPairs = Array.from(pairMap.values()).sort((x, y) => y.count - x.count);

  // ---- Health score ----
  function health(s: SlugStats): {
    score: number;
    precision: number;
    recall: number;
    uniqueness: number;
    penalty: number;
  } {
    const precision = s.timesReturned ? s.timesReturnedCorrect / s.timesReturned : 0;
    const recall = s.expectedTotal ? s.top3Hit / s.expectedTotal : 0;
    // Uniqueness: fraction of times it was the sole top-1 vs shared-list.
    // Approximate via 1 - (confusions caused / timesReturnedWrong+1)
    const uniqueness = s.timesReturnedWrong === 0 ? 1 : 1 / (1 + s.timesReturnedWrong / 4);
    // Penalty: total confusion instances where THIS slug outranked another
    // expected slug.
    let penalty = 0;
    for (const p of conflictPairs) if (p.direction.startsWith(s.slug + " outranks")) penalty += p.count;
    const norm = Math.min(1, penalty / 10);
    const score = 0.4 * precision + 0.4 * recall + 0.2 * uniqueness - 0.3 * norm;
    return { score, precision, recall, uniqueness, penalty };
  }

  // ---- Hierarchy candidates (from confusion + naming heuristic) ----
  type Hint = { parent: string; child: string; evidence: string };
  const hierarchyHints: Hint[] = [];
  for (const [child, parent] of Object.entries(KNOWN_PARENT_OF)) {
    hierarchyHints.push({ parent, child, evidence: "engine PARENT_OF map" });
  }
  for (const p of conflictPairs) {
    // If naming suggests one contains the other's stem
    if (p.a.includes(p.b) || p.b.includes(p.a)) {
      const parent = p.a.length < p.b.length ? p.a : p.b;
      const child = parent === p.a ? p.b : p.a;
      if (!hierarchyHints.find((h) => h.parent === parent && h.child === child)) {
        hierarchyHints.push({ parent, child, evidence: `name contains + ${p.count} confusions` });
      }
    }
  }

  // ---- Merge overlap analysis ----
  type MergeReport = { a: string; b: string; coFire: number; jaccardAliasOverlapNote: string; recommendation: string };
  const merges: MergeReport[] = [];
  for (const [a, b] of MERGE_CANDIDATES) {
    let coFire = 0;
    for (const r of rows) {
      const set = new Set(r.actual);
      if (set.has(a) && set.has(b)) coFire++;
    }
    const sA = stats.get(a);
    const sB = stats.get(b);
    const aExpected = sA?.expectedTotal ?? 0;
    const bExpected = sB?.expectedTotal ?? 0;
    // Heuristic recommendation
    let rec = "keep separate";
    if (aExpected === 0 && bExpected === 0) rec = "merge — neither is a corpus target";
    else if (aExpected === 0 || bExpected === 0) {
      const empty = aExpected === 0 ? a : b;
      const filled = aExpected === 0 ? b : a;
      rec = `sibling suppression — treat "${empty}" as alias/child of "${filled}"`;
    } else if (coFire >= 3) rec = "parent/child — high co-fire indicates overlapping domain";
    merges.push({ a, b, coFire, jaccardAliasOverlapNote: "n/a (alias text not compared here)", recommendation: rec });
  }

  // ---- Umbrella domain FP frequency ----
  const umbrella = UMBRELLA_SLUGS.map((slug) => {
    const s = stats.get(slug);
    if (!s) return { slug, note: "not present in vocab" };
    return {
      slug,
      timesReturned: s.timesReturned,
      falsePositives: s.timesReturnedWrong,
      expectedTotal: s.expectedTotal,
      profileOnlyCandidate: s.expectedTotal === 0 && s.timesReturnedWrong <= 1,
    };
  });

  // ---- Multi-domain failures ----
  const multi = rows
    .filter((r) => r.category === "multiple_domains")
    .map((r) => {
      const setA = new Set(r.actual);
      const missing = r.expected.filter((s) => !setA.has(s));
      let cls = "ok";
      if (missing.length === 0) cls = "pass";
      else if (r.actual.length >= 3 && missing.length > 0) cls = "MAX_MATCHES limitation";
      else if (missing.some((m) => KNOWN_PARENT_OF[m] && setA.has(KNOWN_PARENT_OF[m])))
        cls = "parent suppression issue";
      else if (r.actual.some((a) => a && r.expected.length > 0 && !r.expected.includes(a)))
        cls = "wrong ranking / ontology overlap";
      else cls = "missing candidate";
      return { input: r.input, expected: r.expected, actual: r.actual, classification: cls };
    });

  /* ------------------------- Emit markdown report ------------------------ */
  const slugRows = Array.from(stats.values()).sort((a, b) =>
    a.expectedTotal === b.expectedTotal ? a.slug.localeCompare(b.slug) : b.expectedTotal - a.expectedTotal,
  );

  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  push(`# Phase 17C.4A — Ontology Validation Report\n`);
  push(
    `Analysis only — no production behavior changes. Baseline: Phase 17C.3 (92.6% pass / 78.7% top-1 / MRR 0.867).\n`,
  );
  push(`Total slugs in vocab: **${problems.length}**. Corpus cases: **${rows.length}**.\n`);

  push(`\n## 1. Slug Ontology Report\n`);
  push(
    `| slug | aliases | intents | expected | top-1 | top-3 recall | precision | avg top-conf | FP | FN | top confused |`,
  );
  push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|`);
  for (const s of slugRows) {
    const h = health(s);
    const conf = Array.from(s.confusedWith.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ");
    push(
      `| ${s.slug} | ${s.aliasCount} | ${s.intentCount} | ${s.expectedTotal} | ${pct(s.top1Hit, s.expectedTotal)} | ${pct(s.top3Hit, s.expectedTotal)} | ${(h.precision * 100).toFixed(0)}% | ${s.avgTopConfWhenReturned.toFixed(2)} | ${s.timesReturnedWrong} | ${s.falseNegatives} | ${conf || "—"} |`,
    );
  }

  push(`\n## 2. Semantic Conflict Matrix (top 20 pairs)\n`);
  push(`| Slug A (expected) | Slug B (returned instead) | Count | Direction |`);
  push(`|---|---|---:|---|`);
  for (const p of conflictPairs.slice(0, 20)) {
    push(`| ${p.a} | ${p.b} | ${p.count} | ${p.direction} |`);
  }

  push(`\n## 3. Hierarchy Candidates\n`);
  push(`### Known (engine PARENT_OF)`);
  for (const [c, p] of Object.entries(KNOWN_PARENT_OF)) push(`- **${p}** → ${c}`);
  push(`\n### New candidates from confusion + naming`);
  for (const h of hierarchyHints.filter((x) => x.evidence !== "engine PARENT_OF map")) {
    push(`- **${h.parent}** → ${h.child}  _(${h.evidence})_`);
  }

  push(`\n## 4. Duplicate / Merge Candidates\n`);
  push(`| A | B | co-fire in top-3 | Recommendation |`);
  push(`|---|---|---:|---|`);
  for (const m of merges) push(`| ${m.a} | ${m.b} | ${m.coFire} | ${m.recommendation} |`);

  push(`\n## 5. Umbrella Domain Analysis\n`);
  push(`| Slug | Returned | FP | Expected in corpus | Profile-only candidate? |`);
  push(`|---|---:|---:|---:|:---:|`);
  for (const u of umbrella) {
    if (u.note) {
      push(`| ${u.slug} | — | — | — | ${u.note} |`);
      continue;
    }
    push(
      `| ${u.slug} | ${u.timesReturned} | ${u.falsePositives} | ${u.expectedTotal} | ${u.profileOnlyCandidate ? "✓" : ""} |`,
    );
  }

  push(`\n## 6. Multi-domain Failure Analysis\n`);
  for (const m of multi) {
    push(
      `- \`${m.input}\`\n  - expected: ${JSON.stringify(m.expected)}\n  - actual:   ${JSON.stringify(m.actual)}\n  - class:    **${m.classification}**`,
    );
  }

  push(`\n## 7. Slug Health Score (bottom 15)\n`);
  const healthList = slugRows
    .filter((s) => s.expectedTotal > 0 || s.timesReturned > 0)
    .map((s) => ({ slug: s.slug, ...health(s) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 15);
  push(`| slug | score | precision | recall | uniqueness | conflict penalty |`);
  push(`|---|---:|---:|---:|---:|---:|`);
  for (const h of healthList) {
    push(
      `| ${h.slug} | ${h.score.toFixed(2)} | ${(h.precision * 100).toFixed(0)}% | ${(h.recall * 100).toFixed(0)}% | ${h.uniqueness.toFixed(2)} | ${h.penalty} |`,
    );
  }

  push(`\n## 8. Recommended Phase 17C.4B Changes\n`);
  push(`_Recommendations only — do not implement in this phase._\n`);
  push(
    `1. **Parent-suppression additions** — extend engine \`PARENT_OF\` with the "New candidates" from §3 that pass a manual review (e.g. \`bereavement → grief_loss\`, \`complex_trauma → trauma\`, \`generalized_anxiety → anxiety\`, \`major_life_change → life_transitions\`, \`parent_child_conflict → family_parenting\`).`,
  );
  push(
    `2. **Merges** — for pairs in §4 marked "merge" or "sibling suppression", promote one slug and make the other an alias/child. Priority candidates: \`burnout_depression\` (empty domain), \`loss\` (subsumed by \`grief_loss\`), \`identity_crisis\`/\`self_identity\` (near-synonyms).`,
  );
  push(
    `3. **Umbrella domains** — slugs in §5 with high FP and zero expected corpus targets (see profile-only column) should be **excluded from classify() output** and kept only for \`extractProfile()\` therapist tagging.`,
  );
  push(
    `4. **Multi-domain lift** — cases classified as "MAX_MATCHES limitation" in §6 will not be solvable by ontology alone; retain them for a future \`MAX_MATCHES=5\` experiment (Phase 17C.5).`,
  );
  push(
    `5. **Low-health slugs** in §7 with precision <50% are candidates for alias pruning; low-recall slugs are candidates for hierarchy re-parenting rather than more aliases.`,
  );

  await mkdir(".lovable/reports", { recursive: true });
  const md = lines.join("\n");
  await writeFile(".lovable/reports/phase-17c4a-ontology.md", md);

  const json = {
    baseline: { source: "phase-17c3", pass: 0.926, top1: 0.787, mrr: 0.867 },
    totals: { slugs: problems.length, cases: rows.length, profile_cases: PROFILE_EXTRACTION_CASES.length },
    slugStats: slugRows.map((s) => {
      const h = health(s);
      return {
        slug: s.slug,
        aliases: s.aliasCount,
        intents: s.intentCount,
        expected: s.expectedTotal,
        top1: s.top1Hit,
        top3: s.top3Hit,
        timesReturned: s.timesReturned,
        correct: s.timesReturnedCorrect,
        wrong: s.timesReturnedWrong,
        falseNegatives: s.falseNegatives,
        avgTopConf: s.avgTopConfWhenReturned,
        confusedWith: Object.fromEntries(s.confusedWith),
        health: h,
      };
    }),
    conflictPairs,
    hierarchyHints,
    merges,
    umbrella,
    multiDomain: multi,
  };
  await writeFile(".lovable/reports/phase-17c4a-ontology.json", JSON.stringify(json, null, 2));

  console.log(`Wrote .lovable/reports/phase-17c4a-ontology.md (${md.length} chars)`);
  console.log(`Wrote .lovable/reports/phase-17c4a-ontology.json`);
  console.log(`Slugs analyzed: ${slugRows.length}. Conflict pairs: ${conflictPairs.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
