# Platform Phase P2 — Therapist Profile Claiming & Verification Foundation

**Status:** shipped. No changes to `SemanticEngine`, `semantic_profile`, aliases, intents, ontology, scoring, matcher, normalizer, `searchTherapists`, or `classifyAndSearch`.

## 1. Ownership Model

```
auth.users.id
   └─► therapist_accounts.auth_user_id
          therapist_accounts.id
             └─► therapists.owner_account_id   (nullable, UNIQUE)
```

Derived ownership status (not a column):

| State           | Definition                                                |
| --------------- | --------------------------------------------------------- |
| `unclaimed`     | `owner_account_id IS NULL` AND no `pending` claim request |
| `claim_pending` | `owner_account_id IS NULL` AND ≥1 `pending` claim request |
| `claimed`       | `owner_account_id IS NOT NULL`                            |

Uniqueness guarantees:

- `therapists_owner_account_id_key` — 1:1 account↔therapist.
- `therapist_claim_requests_active_key` — at most one pending/approved request per therapist (blocks races).
- `therapist_claim_requests_requester_open_key` — same requester cannot hold two open requests for the same profile.

## 2. Claim Workflow

1. Sign in → P1 `ensureTherapistAccount` provisions a `therapist_accounts` row.
2. `/account` → "חיפוש ושיוך פרופיל" → `/claim`.
3. Search via Entity Search (§4) against `full_name`, `professional_title`, `city`.
4. Select profile → `submitClaimRequest({ therapistId, verificationMethod, verificationData })`.
   - Server-side precondition: `owner_account_id IS NULL`.
   - RLS INSERT policy re-checks the same.
   - Unique partial index blocks duplicate active requests / race conditions.
5. Row inserted with `status='pending'`.
6. Review (P7) calls `public.approve_therapist_claim(claim_id, reviewer_id)` — `SECURITY DEFINER`, `service_role`-only. It locks the claim `FOR UPDATE`, atomically sets `owner_account_id` iff still NULL, flips `account_status='claimed'`, stamps `reviewed_by/at`.
7. Requester can `cancelClaimRequest(claimId)` for their own pending row (RLS: `USING status='pending'` + own account, `WITH CHECK status='cancelled'`).

Ownership approval never requires a professional credential — see §3.

## 3. Professional Verification (Foundation Only)

`therapist_credentials` is the foundation; no workflow wired yet.

| Column                | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `therapist_id`        | Owning profile                                                        |
| `profession_id`       | Optional link to `professions`                                        |
| `credential_type`     | `license`, `diploma`, `association`, `self`, …                        |
| `institution`         | Issuing body                                                          |
| `license_number`      | For registry-checked professions                                      |
| `document_url`        | Uploaded evidence                                                     |
| `verification_status` | `unverified` / `pending_review` / `verified` / `rejected` / `expired` |
| `verified_by/at`      | Reviewer stamps                                                       |

Deliberately independent of ownership: an owned profile with `verification_status='unverified'` is normal. P4 will wire verification per profession using any subset of: professional license, registry lookup, uploaded diploma, association membership, manual review, self-declared status.

RLS: owners read their own credentials; all writes are `service_role`.

## 4. Entity Search Architecture

Parallel layer to the Semantic Engine — **not merged** into semantic ranking.

```
searchTherapistEntities({ query, limit? }) → TherapistEntityMatch[]
  { id, slug, full_name, professional_title, city,
    image_url, verified, entity_score, match_field }
```

Deterministic scoring:

| Signal                           | entity_score |
| -------------------------------- | ------------ |
| `full_name` exact (case-insens.) | 1.00         |
| `full_name` prefix               | 0.90         |
| `full_name` substring            | 0.75         |
| `professional_title` substring   | 0.50         |
| `city` substring                 | 0.35         |

Storage/perf: `pg_trgm` enabled; GIN trigram indexes on `therapists.full_name` and `therapists.professional_title` accelerate the `ILIKE '%q%'` scan and future high-volume fuzzy queries.

Rendering:

- `/search` renders an "התאמות לפי שם או מקצוע" strip above the semantic result list whenever `entityMatches.length > 0`. The strip is additive; the semantic list ordering is unchanged.
- `/account/claim` uses the same server fn for the picker.

Deliberate non-goals this phase:

- No name-detection heuristic. Every query is matched against the entity index — short/common tokens like `מור` still hit.
- No fusion with `SemanticEngine` scores (P6).
- No clinic-name index yet (added when a clinics table exists).

## 5. Ownership vs Credentials

```
Ownership     ─►  "Does this user control this profile?"
                  → therapists.owner_account_id
                  → verification_method captured on the claim request
                    (email_domain / license_number / manual_review)

Credentials   ─►  "Is this therapist qualified in profession X?"
                  → therapist_credentials.verification_status
                  → per (profession, credential_type)
```

Valid combinations:

- claimed + unverified — owner controls, no credential displayed.
- claimed + verified — future public "verified" badge (P4).
- unclaimed + verified — legacy back-office verification, no live owner.

No column conflates the two.

## 6. RLS Summary

| Table                      | anon | authenticated                                               | service_role |
| -------------------------- | ---- | ----------------------------------------------------------- | ------------ |
| `therapist_claim_requests` | –    | insert own+unclaimed; select own; update-cancel own pending | full         |
| `therapist_credentials`    | –    | select own (owner)                                          | full         |

All approval writes to `therapists.owner_account_id` funnel through `public.approve_therapist_claim`, keeping the ownership transition atomic and auditable.

## 7. Unchanged Surfaces

- `SemanticEngine`, `semantic_profile`, aliases, intents, ontology, scoring, matcher, normalizer.
- `searchTherapists` / `classifyAndSearch` inputs, outputs, ranking.
- Public therapist profile pages.
- `/search` semantic result list — entity strip is additive.

## 8. Roadmap Alignment

- **P3** — Profile editor (writes gated by `owner_account_id`).
- **P4** — Credentials verification workflow + owner UI.
- **P5** — Semantic profile transparency.
- **P6** — Search UX: fuse `entity_score` with semantic ranking; add clinic/modality entity indexes.
- **P7** — Admin moderation tools (approve/reject claims, disputed ownership).

## Files

- Migration: latest `supabase/migrations/*_platform_p2*.sql`
- Server fns: `src/lib/therapist-claims.functions.ts`, `src/lib/entity-search.functions.ts`
- UI: `src/routes/_authenticated/claim.tsx`, `/account` CTA, `/search` entity strip.
