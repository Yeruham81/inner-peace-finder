# Platform P1 — Schema & Auth Reference

## Purpose

Foundation for therapist accounts, ownership, extensible provider model, and
multi-location support. Search behavior and the semantic engine are
intentionally unchanged. Vocabularies (professions / modalities) are empty
by design — content is added in later phases.

## New tables

### `therapist_accounts` (auth-linked, 1:1 with auth.users)

| column                  | type                                      | notes                |
| ----------------------- | ----------------------------------------- | -------------------- |
| id                      | uuid PK                                   |                      |
| auth_user_id            | uuid UNIQUE → auth.users(id)              | ON DELETE CASCADE    |
| onboarding_completed    | boolean                                   | default false        |
| account_status          | enum(pending, active, claimed, suspended) | default pending      |
| created_at / updated_at | timestamptz                               | auto-managed trigger |

RLS: owner-only read/insert/update (`auth_user_id = auth.uid()`).
Ensured on first sign-in via `ensureTherapistAccount()` server fn.

### `professions` + `therapist_professions`

Extensible profession vocabulary (psychologist, speech therapist, dietitian, …).
Many-to-many; `is_primary` flags the therapist's main profession.

### `treatment_modalities` + `therapist_modalities`

Extensible modality vocabulary (CBT, EMDR, DBT, biofeedback, play therapy, …).
Many-to-many.

### `therapist_locations`

| column                                             | type                                              | notes             |
| -------------------------------------------------- | ------------------------------------------------- | ----------------- |
| therapist_id                                       | uuid FK                                           |                   |
| location_type                                      | enum(clinic, home_visit, online, hospital, other) |                   |
| label, address, city, region, country, postal_code | text                                              |                   |
| latitude, longitude                                | numeric(9,6)                                      | ready for PostGIS |
| is_primary, is_active                              | boolean                                           |                   |

Backfilled from `therapists.city / latitude / longitude` for every existing
therapist as a `clinic` + `is_primary = true` row, so future filtering by
`therapist_locations` starts with zero data loss.

## Changes to existing tables

`therapists.owner_account_id` (nullable) → `therapist_accounts(id)` with a
partial UNIQUE index enforcing one profile per account. Nothing else on
`therapists` changed. Existing `city / latitude / longitude` fields are
preserved and still consumed by the current search engine.

## Ownership model

Profiles can exist without an owner (`owner_account_id IS NULL`) — supports
imports and admin-created rows. A signed-in therapist gets exactly one
`therapist_accounts` row (P2 will introduce the claiming flow that fills the
FK on a `therapists` row).

RLS write access to `therapists`, `therapist_professions`,
`therapist_modalities`, and `therapist_locations` is scoped to the owner via
the `owner_account_id → therapist_accounts.auth_user_id` chain.

## Authentication

### Enabled providers

- Email + password (verification on, HIBP breach check on).
- Google OAuth (Lovable-managed by default).
- Apple OAuth (Lovable-managed by default).

### Duplicate account protection

A single therapist always has one `therapist_accounts` row (UNIQUE on
`auth_user_id`). Supabase's built-in identity linking handles the case where
the same verified email signs in via a different provider — the second
provider is attached to the existing `auth.users` row, so
`ensureTherapistAccount()` still resolves the same `therapist_accounts.id`.
No duplicate account is created.

### Routes

- `/auth` — sign in / sign up / forgot password. Public, `ssr: false`.
  Uses `lovable.auth.signInWithOAuth` for Google + Apple.
- `/reset-password` — public, `ssr: false`. Consumes Supabase recovery link.
- `/_authenticated/*` — auth gate (`ssr: false`, `beforeLoad` → `/auth`).
  Preserves `next=<original path>` on redirect.
- `/_authenticated/account` — first authenticated surface. Ensures an
  account row on mount and shows status + placeholder for P2/P3.

### Server functions (`src/lib/therapist-accounts.functions.ts`)

- `ensureTherapistAccount()` — idempotent upsert of the caller's account row.
- `getMyTherapistAccount()` — returns account + `owned_therapist_id`.

Both use `requireSupabaseAuth`; bearer token is attached automatically by the
existing `attachSupabaseAuth` client middleware in `src/start.ts`.

## What did NOT change

- SemanticEngine, semantic profile, aliases, intents, ontology, scoring,
  matcher, normalizer, evaluation corpus, `searchTherapists()` /
  `classifyAndSearch()` — untouched.
- `therapists.city / latitude / longitude / semantic_profile` — untouched.
- Existing `population_groups`, `languages`, `therapist_populations`,
  `therapist_languages`, `therapist_problems` — untouched.

## Roadmap dependencies

- **P2 (claiming)**: uses `therapist_accounts` + nullable `owner_account_id`.
- **P3 (profile editor)**: uses owner-scoped RLS on `therapists`,
  `therapist_professions`, `therapist_modalities`, `therapist_locations`.
- **P5 (search UX)**: switch structured location/profession/modality filters
  from JS-side filtering to SQL joins on the new normalized tables.
- **PostGIS**: add a `geography` column + gist index on `therapist_locations`
  when distance search is introduced.
