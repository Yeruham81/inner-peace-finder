import { createClient } from "@supabase/supabase-js";
// Re-implement scoreEvidenceQuality inline mirroring engine (ratio²).
import { normalizeText, tokenize } from "../src/lib/semantic-engine";

function q(phrase: string, text: string) {
  const nQ = normalizeText(text);
  const nP = normalizeText(phrase);
  const qT = new Set(tokenize(text));
  const pT = tokenize(phrase);
  const full = nP.length >= 2 && nQ.includes(nP);
  let overlap = 0;
  for (const t of pT) if (qT.has(t)) overlap++;
  const ratio = pT.length ? overlap / pT.length : 0;
  const quality = full ? 1 : Math.max(0.05, ratio * ratio);
  return {
    full,
    tokens: pT.length,
    overlap,
    ratio: +ratio.toFixed(2),
    quality: +quality.toFixed(3),
  };
}

const rows = [
  ["דיכאון וכאב רגשי", "אני מטפל בדיכאון ובדכאונות ממושכים."],
  ["דיכאון שחיקה", "אני מטפל בדיכאון ובדכאונות ממושכים."],
  ["אני בדיכאון", "אני מטפל בדיכאון ובדכאונות ממושכים."],
  ["חרדה ופחדים", "אני מטפל בחרדה ומעבר לחצים."],
  ["חרדה כללית", "אני מטפל בחרדה ומעבר לחצים."],
  ["אני חרד", "אני מטפל בחרדה ומעבר לחצים."],
  ["זוגיות והיקשרות", "אני עוסק בטיפול זוגי ובזוגיות."],
  ["משבר בזוגיות", "אני עוסק בטיפול זוגי ובזוגיות."],
  ["משבר זוגי", "אני עוסק בטיפול זוגי ובזוגיות."],
  ["מעברי חיים והסתגלות", "אני מלווה משברי חיים והתמודדויות נפשיות."],
  ["משבר חריף", "אני מלווה משברי חיים והתמודדויות נפשיות."],
];
for (const [p, t] of rows)
  console.log(
    `  phrase="${p}"`.padEnd(40),
    q(p, t),
    " (multi≥0.6? ",
    (q(p, t).tokens >= 2 && q(p, t).quality >= 0.6) || q(p, t).full,
    ")",
  );
