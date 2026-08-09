# Platform Phase P3.1 — Therapist Profile Editor

Adds the therapist-facing profile creation & editing flow with an
explicit Draft → Completed → Published lifecycle, while keeping the
existing structured/semantic search, claim workflow, and ownership
model unchanged.

## Database

- New enum `therapist_gender` (`male`, `female`, `unspecified`).
- New enum `therapist_profile_status` (`draft`, `completed`, `published`).
- `therapists.gender therapist_gender NULL`.
- `therapists.email text NULL` — contact email, separate from
  auth email and stored so future channels (email / SMS / WhatsApp /
  phone) can each dispatch off structured fields.
- `therapists.profile_status therapist_profile_status NOT NULL DEFAULT 'draft'`,
  backfilled to `published` for every pre-existing row (so nothing
  disappears from public search).
- Loosened NOT NULL on `professional_title` and `city` so drafts can
  be saved with minimal input; publish validation enforces them.
- New RLS policy `"Owner can insert own therapist row"` — a signed-in
  therapist account can insert exactly one profile row whose
  `owner_account_id` matches its own account. The existing UNIQUE
  index on `owner_account_id` enforces the 1:1 constraint.

## Public visibility

Public search filters (`searchTherapists`, `structured-search` name and
structured-join lookups, `getTherapistBySlug`) now require both
`is_active = true` AND `profile_status = 'published'`. Draft and
completed-but-unpublished profiles are therefore invisible in
structured search, semantic search, and direct slug fetches.

On save, the server function keeps `is_active` and `visibility` aligned
with `profile_status`: only a `published` row is `is_active = true` and
`visibility = 'published'`.

## Server functions (`src/lib/therapist-profile.functions.ts`)

- `getEditorOptions()` — public list of professions, treatment
  modalities, languages, and population groups for the editor.
- `getMyProfile()` (auth) — returns the current user's profile with
  all m2m selections and primary/online locations.
- `saveMyProfile({ ..., publish })` (auth) —
  - Creates the profile row on first save (ownership INSERT policy).
  - On subsequent saves, updates the owned row (existing owner
    UPDATE policy).
  - Rewrites m2m links (`therapist_professions`, `_modalities`,
    `_languages`, `_populations`) and locations (primary clinic +
    optional online row) using existing owner-scoped RLS.
  - When `publish=true`, runs publish validation server-side and
    returns `{ missing: string[] }` on failure without mutating.
  - Recomputes `profile_status` as `published` (on successful publish),
    `completed` (all required fields present, saving as draft), or
    `draft` otherwise.
  - On first successful creation, promotes the account to
    `account_status = 'claimed'` and `onboarding_completed = true`.

### Publish requirements

`full_name`, `gender`, at least one `profession`, `full_description`
(min 60 chars), `email`, `phone`, and either a physical `city` or
`online_available = true`.

### Description length

`DESCRIPTION_MIN = 60`, `DESCRIPTION_MAX = 4000` (UI counter + server
validation). Editor guidance is neutral — no keyword/SEO framing.

## UI (`src/routes/_authenticated/new-profile.tsx`)

Full RTL Hebrew editor with sections for basic info, contact
information, professional info, professional description (with a `?`
help dialog covering the recommended structure), treatment
modalities, languages, populations, and location + online
availability. Explicit `שמירת טיוטה` and `פרסום פרופיל` buttons —
never auto-save. Publish failures show a friendly Hebrew list of
missing fields. Status badge (`טיוטה`/`מוכן לפרסום`/`מפורסם`) at the
top-right, with toast confirmation for both save and publish.

Account page (`/account`) now offers `עריכת פרופיל` when a profile is
owned and continues to show the two-option grid otherwise.

## Out of scope (per spec)

No semantic feedback panel, no ranking exposure, no credential upload,
no verification workflow, no admin moderation, no reviews, no
messaging.
