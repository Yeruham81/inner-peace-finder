# Phase 17C.4A — Ontology Validation Report

Analysis only — no production behavior changes. Baseline: Phase 17C.3 (92.6% pass / 78.7% top-1 / MRR 0.867).

Total slugs in vocab: **66**. Corpus cases: **94**.

## 1. Slug Ontology Report

| slug                       | aliases | intents | expected |  top-1 | top-3 recall | precision | avg top-conf |  FP |  FN | top confused                                      |
| -------------------------- | ------: | ------: | -------: | -----: | -----------: | --------: | -----------: | --: | --: | ------------------------------------------------- |
| anxiety                    |      21 |      12 |       14 |  85.7% |        85.7% |       71% |         0.59 |   6 |   2 | intrusive_thoughts(1), low_mood(1), depression(1) |
| burnout                    |      15 |       4 |        8 |  75.0% |        87.5% |       88% |         0.73 |   1 |   1 | anxiety(1), couples_conflict(1), relationships(1) |
| depression                 |      13 |       6 |        8 |  75.0% |        87.5% |       43% |         0.57 |  12 |   1 | anxiety(1), social_anxiety(1), panic(1)           |
| couples_conflict           |      11 |       4 |        4 |  75.0% |       100.0% |       36% |         0.75 |   7 |   0 | —                                                 |
| low_self_esteem            |      10 |       4 |        4 | 100.0% |       100.0% |       57% |         0.72 |   3 |   0 | —                                                 |
| ocd_compulsions            |       5 |       6 |        4 |  50.0% |        75.0% |       60% |         0.44 |   2 |   1 | anxiety(1), social_anxiety(1), panic(1)           |
| ptsd                       |      10 |       5 |        4 |  75.0% |       100.0% |       80% |         0.69 |   1 |   0 | —                                                 |
| divorce                    |       8 |       3 |        3 | 100.0% |       100.0% |       75% |         0.73 |   1 |   0 | —                                                 |
| emotional_overwhelm        |      12 |       4 |        3 | 100.0% |       100.0% |       50% |         0.65 |   3 |   0 | —                                                 |
| grief_loss                 |      16 |      12 |        3 |  66.7% |       100.0% |       33% |         0.59 |   6 |   0 | —                                                 |
| panic                      |      10 |       5 |        3 | 100.0% |       100.0% |       44% |         0.77 |   5 |   0 | —                                                 |
| social_anxiety             |       7 |       4 |        3 | 100.0% |       100.0% |       27% |         0.62 |   8 |   0 | —                                                 |
| addiction                  |       5 |       6 |        2 |   0.0% |        50.0% |      100% |         0.00 |   0 |   1 | substance_use(1), trauma(1), childhood_trauma(1)  |
| anger                      |      10 |       4 |        2 | 100.0% |       100.0% |       67% |         0.66 |   1 |   0 | —                                                 |
| eating_body                |       5 |       6 |        2 |  50.0% |       100.0% |       25% |         0.71 |   6 |   0 | —                                                 |
| intimacy_issues            |       7 |       3 |        2 | 100.0% |       100.0% |       50% |         0.77 |   2 |   0 | —                                                 |
| loneliness                 |      10 |       4 |        2 | 100.0% |       100.0% |       27% |         0.68 |   8 |   0 | —                                                 |
| low_mood                   |      10 |       3 |        2 | 100.0% |       100.0% |       18% |         0.73 |   9 |   0 | —                                                 |
| relationships              |       5 |       6 |        2 | 100.0% |       100.0% |       44% |         0.56 |   5 |   0 | —                                                 |
| substance_use              |       9 |       3 |        2 | 100.0% |       100.0% |       50% |         0.65 |   2 |   0 | —                                                 |
| trauma                     |       7 |       6 |        2 | 100.0% |       100.0% |       40% |         0.54 |   3 |   0 | —                                                 |
| acute_crisis               |       0 |       0 |        1 |   0.0% |       100.0% |      100% |         0.00 |   0 |   0 | —                                                 |
| body_image                 |       7 |       3 |        1 | 100.0% |       100.0% |       40% |         0.69 |   3 |   0 | —                                                 |
| breakup                    |       8 |       3 |        1 | 100.0% |       100.0% |       33% |         0.74 |   2 |   0 | —                                                 |
| health_anxiety             |       7 |       3 |        1 | 100.0% |       100.0% |       50% |         0.75 |   1 |   0 | —                                                 |
| identity_crisis            |       7 |       3 |        1 | 100.0% |       100.0% |       13% |         0.70 |   7 |   0 | —                                                 |
| intrusive_thoughts         |       6 |       3 |        1 | 100.0% |       100.0% |       50% |         0.65 |   1 |   0 | —                                                 |
| life_transitions           |      11 |       7 |        1 | 100.0% |       100.0% |       17% |         0.70 |   5 |   0 | —                                                 |
| parenting_stress           |       9 |       3 |        1 | 100.0% |       100.0% |       40% |         0.78 |   3 |   0 | —                                                 |
| procrastination            |       8 |       3 |        1 | 100.0% |       100.0% |       50% |         0.75 |   1 |   0 | —                                                 |
| psychosomatic              |       5 |       3 |        1 | 100.0% |       100.0% |       20% |         0.76 |   4 |   0 | —                                                 |
| self_identity              |       3 |       6 |        1 |   0.0% |       100.0% |       17% |         0.00 |   5 |   0 | —                                                 |
| adhd                       |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| anhedonia                  |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| attachment_issues          |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| autism                     |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| behavioral_addiction       |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| bereavement                |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| binge_eating               |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| burnout_depression         |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   5 |   0 | —                                                 |
| career_change              |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| childhood_development      |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| childhood_trauma           |       5 |       3 |        0 |    n/a |          n/a |       25% |         0.00 |   3 |   0 | —                                                 |
| communication_difficulties |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| communication_expression   |       0 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| complex_trauma             |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   3 |   0 | —                                                 |
| compulsions                |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| developmental              |      10 |       5 |        0 |    n/a |          n/a |        0% |         0.39 |   4 |   0 | —                                                 |
| emotional_regulation       |       0 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| existential                |       5 |       5 |        0 |    n/a |          n/a |        0% |         0.00 |   3 |   0 | —                                                 |
| existential_anxiety        |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| family_parenting           |       0 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| generalized_anxiety        |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| loss                       |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| major_life_change          |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| meaning_crisis             |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| neurodiversity             |       2 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| parent_child_conflict      |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| performance_anxiety        |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| performance_functioning    |       0 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| sexual_dysfunction         |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| sexuality_intimacy         |       0 |       6 |        0 |    n/a |          n/a |        0% |         0.00 |   3 |   0 | —                                                 |
| social_belonging           |       6 |       6 |        0 |    n/a |          n/a |        0% |         0.00 |   4 |   0 | —                                                 |
| social_isolation           |       0 |       0 |        0 |    n/a |          n/a |        0% |         0.00 |   1 |   0 | —                                                 |
| somatic                    |       0 |       1 |        0 |    n/a |          n/a |        0% |         0.00 |   0 |   0 | —                                                 |
| trust_issues               |       6 |       3 |        0 |    n/a |          n/a |       17% |         0.61 |   5 |   0 | —                                                 |

## 2. Semantic Conflict Matrix (top 20 pairs)

| Slug A (expected) | Slug B (returned instead) | Count | Direction                               |
| ----------------- | ------------------------- | ----: | --------------------------------------- |
| anxiety           | depression                |     2 | depression outranks anxiety             |
| anxiety           | intrusive_thoughts        |     1 | intrusive_thoughts outranks anxiety     |
| anxiety           | low_mood                  |     1 | low_mood outranks anxiety               |
| burnout           | anxiety                   |     1 | anxiety outranks burnout                |
| burnout           | couples_conflict          |     1 | couples_conflict outranks burnout       |
| burnout           | relationships             |     1 | relationships outranks burnout          |
| anxiety           | relationships             |     1 | relationships outranks anxiety          |
| anxiety           | eating_body               |     1 | eating_body outranks anxiety            |
| anxiety           | trust_issues              |     1 | trust_issues outranks anxiety           |
| ocd_compulsions   | anxiety                   |     1 | anxiety outranks ocd_compulsions        |
| ocd_compulsions   | social_anxiety            |     1 | social_anxiety outranks ocd_compulsions |
| ocd_compulsions   | panic                     |     1 | panic outranks ocd_compulsions          |
| addiction         | substance_use             |     1 | substance_use outranks addiction        |
| addiction         | trauma                    |     1 | trauma outranks addiction               |
| addiction         | childhood_trauma          |     1 | childhood_trauma outranks addiction     |
| depression        | social_anxiety            |     1 | social_anxiety outranks depression      |
| depression        | panic                     |     1 | panic outranks depression               |

## 3. Hierarchy Candidates

### Known (engine PARENT_OF)

- **anxiety** → panic
- **anxiety** → social_anxiety
- **anxiety** → health_anxiety
- **ocd_compulsions** → intrusive_thoughts
- **trauma** → childhood_trauma
- **trauma** → ptsd
- **eating_body** → body_image
- **depression** → low_mood

### New candidates from confusion + naming

## 4. Duplicate / Merge Candidates

| A                | B                     | co-fire in top-3 | Recommendation                                                                       |
| ---------------- | --------------------- | ---------------: | ------------------------------------------------------------------------------------ |
| addiction        | substance_use         |                1 | keep separate                                                                        |
| addiction        | behavioral_addiction  |                0 | sibling suppression — treat "behavioral_addiction" as alias/child of "addiction"     |
| grief_loss       | loss                  |                1 | sibling suppression — treat "loss" as alias/child of "grief_loss"                    |
| grief_loss       | bereavement           |                1 | sibling suppression — treat "bereavement" as alias/child of "grief_loss"             |
| burnout          | burnout_depression    |                2 | sibling suppression — treat "burnout_depression" as alias/child of "burnout"         |
| self_identity    | identity_crisis       |                3 | parent/child — high co-fire indicates overlapping domain                             |
| self_identity    | low_self_esteem       |                4 | parent/child — high co-fire indicates overlapping domain                             |
| identity_crisis  | low_self_esteem       |                3 | parent/child — high co-fire indicates overlapping domain                             |
| trauma           | complex_trauma        |                1 | sibling suppression — treat "complex_trauma" as alias/child of "trauma"              |
| trauma           | childhood_trauma      |                1 | sibling suppression — treat "childhood_trauma" as alias/child of "trauma"            |
| anxiety          | generalized_anxiety   |                0 | sibling suppression — treat "generalized_anxiety" as alias/child of "anxiety"        |
| depression       | low_mood              |                6 | parent/child — high co-fire indicates overlapping domain                             |
| eating_body      | binge_eating          |                1 | sibling suppression — treat "binge_eating" as alias/child of "eating_body"           |
| eating_body      | body_image            |                2 | keep separate                                                                        |
| life_transitions | major_life_change     |                1 | sibling suppression — treat "major_life_change" as alias/child of "life_transitions" |
| family_parenting | parenting_stress      |                1 | sibling suppression — treat "family_parenting" as alias/child of "parenting_stress"  |
| family_parenting | parent_child_conflict |                0 | merge — neither is a corpus target                                                   |

## 5. Umbrella Domain Analysis

| Slug                     | Returned |  FP | Expected in corpus | Profile-only candidate? |
| ------------------------ | -------: | --: | -----------------: | :---------------------: |
| communication_expression |        0 |   0 |                  0 |            ✓            |
| neurodiversity           |        0 |   0 |                  0 |            ✓            |
| somatic                  |        0 |   0 |                  0 |            ✓            |
| performance_functioning  |        1 |   1 |                  0 |            ✓            |
| emotional_regulation     |        0 |   0 |                  0 |            ✓            |
| family_parenting         |        1 |   1 |                  0 |            ✓            |
| burnout_depression       |        5 |   5 |                  0 |                         |

## 6. Multi-domain Failure Analysis

- `אני בלחץ מהעבודה וגם הזוגיות שלי לא טובה`
  - expected: ["burnout","relationships"]
  - actual: ["anxiety","couples_conflict","relationships"]
  - class: **MAX_MATCHES limitation**
- `אני לא ישן טוב ואני מרגיש חרדה`
  - expected: ["anxiety"]
  - actual: ["anxiety","social_anxiety","low_mood"]
  - class: **pass**
- `יש לי פחד מטיסה וגם בעיות בביטחון עצמי`
  - expected: ["anxiety","low_self_esteem"]
  - actual: ["relationships","eating_body","trust_issues"]
  - class: **MAX_MATCHES limitation**
- `דיכאון וחרדה שמלווים אותי מזה שנים`
  - expected: ["depression","anxiety"]
  - actual: ["anxiety","depression","social_anxiety"]
  - class: **pass**
- `אחרי טראומה מהצבא יש לי גם התקפי פאניקה`
  - expected: ["ptsd","panic"]
  - actual: ["panic","trauma","ptsd"]
  - class: **pass**
- `אני שותה יותר מדי בגלל הדיכאון`
  - expected: ["substance_use","depression"]
  - actual: ["substance_use","depression","eating_body"]
  - class: **pass**
- `בעיות אכילה על רקע דימוי גוף נמוך`
  - expected: ["eating_body","body_image"]
  - actual: ["body_image","eating_body","low_self_esteem"]
  - class: **pass**
- `אני כועסת על בן הזוג שלי ומתפרצת על הילדים`
  - expected: ["couples_conflict","parenting_stress"]
  - actual: ["couples_conflict","anger","parenting_stress"]
  - class: **pass**
- `עברתי גירושין ומאז אני בדיכאון עמוק`
  - expected: ["divorce","depression"]
  - actual: ["divorce","depression","burnout_depression"]
  - class: **pass**
- `אבל על אמא שנפטרה ובדידות קשה`
  - expected: ["grief_loss","loneliness"]
  - actual: ["loneliness","grief_loss","breakup"]
  - class: **pass**
- `OCD וחרדה שמשתקים אותי בעבודה`
  - expected: ["ocd_compulsions","anxiety"]
  - actual: ["anxiety","social_anxiety","panic"]
  - class: **MAX_MATCHES limitation**
- `בעיות אינטימיות בזוגיות ופחד מקרבה`
  - expected: ["intimacy_issues","relationships"]
  - actual: ["intimacy_issues","relationships","couples_conflict"]
  - class: **pass**
- `שחיקה בעבודה ומחשבות אובדניות`
  - expected: ["burnout","depression"]
  - actual: ["burnout","loss","grief_loss"]
  - class: **MAX_MATCHES limitation**
- `התמכרות לסמים אחרי טראומה בילדות`
  - expected: ["addiction","childhood_trauma"]
  - actual: ["substance_use","trauma","childhood_trauma"]
  - class: **MAX_MATCHES limitation**
- `בעיות זוגיות אחרי בגידה, אני לא מצליחה לסמוך יותר`
  - expected: ["couples_conflict","trust_issues"]
  - actual: ["trust_issues","relationships","couples_conflict"]
  - class: **pass**

## 7. Slug Health Score (bottom 15)

| slug                    | score | precision | recall | uniqueness | conflict penalty |
| ----------------------- | ----: | --------: | -----: | ---------: | ---------------: |
| burnout_depression      |  0.09 |        0% |     0% |       0.44 |                0 |
| developmental           |  0.10 |        0% |     0% |       0.50 |                0 |
| social_belonging        |  0.10 |        0% |     0% |       0.50 |                0 |
| complex_trauma          |  0.11 |        0% |     0% |       0.57 |                0 |
| existential             |  0.11 |        0% |     0% |       0.57 |                0 |
| sexuality_intimacy      |  0.11 |        0% |     0% |       0.57 |                0 |
| trust_issues            |  0.13 |       17% |     0% |       0.44 |                1 |
| bereavement             |  0.16 |        0% |     0% |       0.80 |                0 |
| binge_eating            |  0.16 |        0% |     0% |       0.80 |                0 |
| family_parenting        |  0.16 |        0% |     0% |       0.80 |                0 |
| generalized_anxiety     |  0.16 |        0% |     0% |       0.80 |                0 |
| loss                    |  0.16 |        0% |     0% |       0.80 |                0 |
| major_life_change       |  0.16 |        0% |     0% |       0.80 |                0 |
| performance_functioning |  0.16 |        0% |     0% |       0.80 |                0 |
| social_isolation        |  0.16 |        0% |     0% |       0.80 |                0 |

## 8. Recommended Phase 17C.4B Changes

_Recommendations only — do not implement in this phase._

1. **Parent-suppression additions** — extend engine `PARENT_OF` with the "New candidates" from §3 that pass a manual review (e.g. `bereavement → grief_loss`, `complex_trauma → trauma`, `generalized_anxiety → anxiety`, `major_life_change → life_transitions`, `parent_child_conflict → family_parenting`).
2. **Merges** — for pairs in §4 marked "merge" or "sibling suppression", promote one slug and make the other an alias/child. Priority candidates: `burnout_depression` (empty domain), `loss` (subsumed by `grief_loss`), `identity_crisis`/`self_identity` (near-synonyms).
3. **Umbrella domains** — slugs in §5 with high FP and zero expected corpus targets (see profile-only column) should be **excluded from classify() output** and kept only for `extractProfile()` therapist tagging.
4. **Multi-domain lift** — cases classified as "MAX_MATCHES limitation" in §6 will not be solvable by ontology alone; retain them for a future `MAX_MATCHES=5` experiment (Phase 17C.5).
5. **Low-health slugs** in §7 with precision <50% are candidates for alias pruning; low-recall slugs are candidates for hierarchy re-parenting rather than more aliases.
