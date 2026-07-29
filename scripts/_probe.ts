import { interpretQuery } from "@/lib/query-interpreter";
import type { Catalog } from "@/lib/query-interpreter.types";

const baseCities = [
  { canonical: "חיפה", aliases: ["חיפה", "haifa"] },
  { canonical: "תל אביב", aliases: ["תל אביב", 'ת"א', "תא"] },
  { canonical: "ירושלים", aliases: ["ירושלים"] },
  { canonical: "רחובות", aliases: ["רחובות"] },
  { canonical: "באר שבע", aliases: ["באר שבע"] },
];

function perms<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of perms(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

const queries = [
  "עדיף מטפלת ב-CBT בחיפה",
  "מטפלת ב-CBT בתל אביב",
  "פסיכולוגית עם CBT בירושלים",
  "עדיף CBT ברחובות",
  "מטפלת ב-CBT בבאר שבע",
];

for (const q of queries) {
  const seen = new Set<string>();
  for (const cities of perms(baseCities)) {
    const cat: Catalog = {
      professions: [
        { id: "p1", slug: "psychologist", name_he: "פסיכולוג",
          nameVariants: ["פסיכולוג", "פסיכולוגית"],
          feminineVariants: ["פסיכולוגית"] },
      ],
      modalities: [
        { id: "m1", slug: "cbt", name_he: "cbt", nameVariants: ["cbt"] },
      ],
      populations: [],
      languages: [],
      cities,
      therapistNames: [],
      firstNameCount: new Map(),
    };
    const r = interpretQuery(q, cat);
    seen.add(JSON.stringify({ h: r.hardFilters, s: r.softPreferences, rem: r.semanticRemainder }));
  }
  console.log(q, "→ distinct outcomes:", seen.size);
  for (const s of seen) console.log("  ", s);
}
