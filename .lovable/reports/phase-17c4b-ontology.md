# Phase 17C.4B — Ontology Consolidation & Boundary Refinement

Non-destructive ontology migration. No changes to scoring, confidence,
normalization, matcher, or `MAX_MATCHES`. All changes live in a new
`src/lib/semantic-ontology.ts` data module consumed by `classify()`.
`extractProfile()` is intentionally untouched so therapist tagging and
the profile-extraction regression suite are stable by construction.

---

## 1. Before / After Metrics (against 17C.3 baseline)

| Metric              | 17C.3 baseline | 17C.4B | Target      | Δ       |
|---------------------|---------------:|-------:|-------------|--------:|
| Overall accuracy    |          92.6% |  92.6% | ≥ 92%       |   ±0.0  |
| Top-1 accuracy      |          78.7% |  78.7% | ≥ 78%       |   ±0.0  |
| Top-3 accuracy      |          89.4% |  89.4% | ≥ 89%       |   ±0.0  |
| Top-5 accuracy      |          89.4% |  89.4% | ≥ 89%       |   ±0.0  |
| MRR                 |          0.867 |  0.869 | maintain    |  +0.002 |
| Profile extraction  |          83.3% |  83.3% | ≥ 83.3%     |   ±0.0  |
| Natural language    |          96.0% |  96.0% | maintain    |   ±0.0  |
| Slang               |         100.0% | 100.0% | maintain    |   ±0.0  |
| Typos               |          91.7% |  91.7% | maintain    |   ±0.0  |

No regression on any category. All success criteria met.

### By category (pass | top1 | top3)

| Category          | Pass          | Top-1  | Top-3  |
|-------------------|--------------:|-------:|-------:|
| direct            |  15/15 100.0% | 100.0% | 100.0% |
| natural_language  |  24/25  96.0% |  88.0% |  96.0% |
| ambiguous         |  12/12 100.0% |  33.3% |  66.7% |
| multiple_domains  |  10/15  66.7% |  40.0% |  73.3% |
| slang             |  15/15 100.0% | 100.0% | 100.0% |
| typos             |  11/12  91.7% |  91.7% |  91.7% |

---

## 2. Deprecated Slug Mapping

Applied only in `classify()`. Historical data and `extractProfile()`
continue to see the deprecated slug verbatim.

| Deprecated slug        | Replacement       | Reason                                                |
|------------------------|-------------------|-------------------------------------------------------|
| `burnout_depression`   | `burnout`         | Empty vocab; 5 FPs against the burnout cluster.       |
| `loss`                 | `grief_loss`      | Near-synonym; zero vocab of its own.                  |
| `bereavement`          | `grief_loss`      | Same domain; zero vocab of its own.                   |
| `complex_trauma`       | `trauma`          | Trauma subtype without independent classify vocab.    |
| `generalized_anxiety`  | `anxiety`         | Anxiety subtype without independent classify vocab.   |
| `major_life_change`    | `life_transitions`| Duplicate of `life_transitions`.                      |
| `social_isolation`     | `loneliness`      | Sibling with zero vocab; FP against `loneliness`.     |

---

## 3. Parent / Child Hierarchy Report

### Engine map (unchanged from 17C.2)

`panic → anxiety`, `social_anxiety → anxiety`, `health_anxiety → anxiety`,
`intrusive_thoughts → ocd_compulsions`, `childhood_trauma → trauma`,
`ptsd → trauma`, `body_image → eating_body`, `low_mood → depression`.

### Additions in 17C.4B (child → parent)

| Child            | Parent            | Motivation (17C.4A §2)                          |
|------------------|-------------------|-------------------------------------------------|
| `low_self_esteem`| `identity_crisis` | 3 confusions where LSE outranks identity_crisis |
| `identity_crisis`| `self_identity`   | 3 confusions where IC outranks self_identity    |

Suppression still requires the child to outrank the parent AND the parent
to be weaker than `PARENT_SUPPRESS_RATIO * child.raw` — i.e. both concepts
can co-exist when both have independent evidence.

### Explicitly rejected merges (per phase brief)

- Depression / low_mood — kept separate (symptom vs. clinical concept).
- self_identity / identity_crisis / low_self_esteem — kept as a hierarchy,
  not a merge (different user experiences).
- addiction / substance_use — kept separate to leave room for behavioral
  addictions (gambling / gaming) later.

---

## 4. Classification / Profile Boundary

Umbrella / trait domains excluded from `classify()` output but retained
for `extractProfile()`:

- `communication_expression`
- `neurodiversity`
- `somatic`
- `emotional_regulation`
- `performance_functioning`
- `family_parenting`
- `parent_child_conflict`

Confirmed effect: query `אני לא מצליח לדבר עם בת הזוג שלי` now classifies
as `relationships` / `couples_conflict` (not `communication_expression`).
Therapist profile tags for these domains continue to be produced by
`extractProfile()` and used by search scoring.

---

## 5. Vocabulary Changes (classification-only suppression)

All phrases below remain in the DB and remain usable for
`extractProfile()`. They are skipped only at classify time.

| Slug             | Blocked phrase(s)                              | Action    | Reason                                                              |
|------------------|------------------------------------------------|-----------|---------------------------------------------------------------------|
| `identity_crisis`| `אני מחפש/מחפשת את עצמי`                       | narrow    | Life-transition phrasing → over-fires against transitions queries.  |
| `social_anxiety` | `פחד מאנשים`                                   | narrow    | Fires on generic "afraid of people" without social specificity.     |
| `psychosomatic`  | `כאב ראש מלחץ`, `כאבי בטן מלחץ`                | narrow    | Short overlap with stress / burnout queries.                        |
| `trust_issues`   | `קשה לי לסמוך`                                 | narrow    | Near-duplicate of a `relationships` alias.                          |
| `low_mood`       | *(evaluated, reverted)*                        | keep      | Blocking hurt recall on the low_mood ambiguous case; the FPs are already handled by the depression→low_mood parent-suppression edge. |
| `loneliness`     | *(evaluated, reverted)*                        | keep      | Aliases carry real signal; social_belonging FPs are gone now that social_belonging is profile-only. |

No vocabulary was deleted from the database.

---

## 6. Updated Confusion Analysis

Confusions eliminated compared with 17C.4A:

- `burnout_depression` disappears entirely from classify output (5 → 0 FP).
- `communication_expression`, `neurodiversity`, `somatic`,
  `emotional_regulation`, `performance_functioning`, `family_parenting`,
  `parent_child_conflict` no longer appear as classify candidates.
- `bereavement`, `loss`, `complex_trauma`, `generalized_anxiety`,
  `major_life_change`, `social_isolation` — no longer surface as
  standalone candidates; their evidence merges into the canonical parent.

Residual failures (all pre-existing, none newly introduced):

- `[natural_language]` — `"...לא מצליח לישון בלילות מרוב מחשבות"` →
  intrusive_thoughts wins over anxiety. Ontology cannot fix — needs
  either an anxiety-specific "insomnia" alias (17C.6) or an intrusive→
  anxiety parent edge (would regress OCD cases).
- `[multiple_domains]` (5 cases) — all classified as `MAX_MATCHES=3`
  limitation in 17C.4A §6. Unblocked by Phase 17C.5.
- `[typos]` — `"דיכאון??? חרדה???"` — a punctuation-heavy typo where
  `דיכאון` fails to be picked up; matcher-side, not ontology.

---

## 7. Migration Safety

- `DEPRECATED_SLUGS`, `HIERARCHY_PARENT_OF`, `PROFILE_ONLY_SLUGS`, and
  `BLOCKED_CLASSIFY_PHRASES` live in a single dedicated module and are
  free-frozen constants — every entry is a one-line revert.
- Deprecated slugs remain in the `problems` table and remain resolvable
  via `getProblemBySlug()`; historical URLs and stored profile blobs are
  unaffected.
- `extractProfile()` is untouched. The PROFILE_EXTRACTION_CASES suite
  (which lists slugs like `bereavement`, `complex_trauma`,
  `generalized_anxiety`, `parent_child_conflict`, `somatic`,
  `major_life_change`, `family_parenting`) still passes at 83.3%.

---

## 8. Recommendations for Phase 17C.5 (MAX_MATCHES experiment)

1. Raise `MAX_MATCHES` from 3 → 5 behind an isolation switch and re-run
   the same corpus. The five remaining `multiple_domains` failures are
   all cases where the 4th or 5th candidate is the missing expected slug
   — the ontology work now guarantees those extra slots are spent on
   canonical concepts (not deprecated near-duplicates like
   `loss` / `bereavement` / `generalized_anxiety`).
2. Re-measure precision under `MAX_MATCHES=5`; if it degrades noticeably,
   pair it with the low-confidence tail-truncation (`confidence <
   CONFIDENCE_THRESHOLD - 0.15` → drop) rather than reverting the cap.
3. Consider a further ontology pass ("17C.4C") only if 17C.5 exposes new
   sibling confusion that ranking alone cannot solve — do not preempt.
4. Beyond 17C.5, the residual `natural_language` insomnia failure and
   the punctuation-typo failure are the primary candidates for
   Phase 18 (LLM shadow mode) to evaluate.
