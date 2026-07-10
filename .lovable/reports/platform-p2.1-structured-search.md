# Platform Phase P2.1 — Structured Search Foundation

## Overview

Structured Search generalizes the previous "Entity Search" layer into the
platform's single source of truth for searching structured entities. It runs
in parallel to the SemanticEngine and never modifies semantic ranking,
scoring, ontology, aliases, intents, normalization, or the matcher. Phase 6
(P6) will fuse Structured Search with Semantic Search into a unified ranked
experience.

## Architecture

- Single server function: `searchStructured({ query, types?, limit? })`
  in `src/lib/structured-search.functions.ts`.
- Convenience wrapper: `searchStructuredTherapists({ query, limit? })` for
  call sites that only need therapist results (currently the claim flow and
  the search-page "matches by name" strip).
- Results are a discriminated union keyed by a `type` field, so UI
  components can render each entity type differently without changing the
  API. Adding a new entity type = adding a new matcher and a new union
  member — no core refactor.

### Result shape

```ts
type StructuredResult =
  | TherapistStructuredResult   // { type: "therapist",  ... }
  | ProfessionStructuredResult  // { type: "profession", ... }
  | ModalityStructuredResult    // { type: "modality",   ... }
  | LocationStructuredResult;   // { type: "location",   ... }
```

## Searchable entity types (this phase)

| Type         | Authoritative source                                       |
|--------------|------------------------------------------------------------|
| `therapist`  | `public.therapists` (identity) + structured joins below    |
| `profession` | `public.professions` ⨝ `public.therapist_professions`      |
| `modality`   | `public.treatment_modalities` ⨝ `public.therapist_modalities` |
| `location`   | `public.therapist_locations` (city, region, is_active)     |

### Key changes vs. Phase P2 Entity Search

- **Renamed** everywhere internally: `entity-search` → `structured-search`,
  `TherapistEntityMatch` → `TherapistStructuredResult`,
  `searchTherapistEntities` → `searchStructuredTherapists`.
  The old file `src/lib/entity-search.functions.ts` was removed.
- **Professions** no longer come from the free-text
  `therapists.professional_title`. Queries such as `פסיכולוג`,
  `פסיכיאטר`, `קלינאית תקשורת`, `פיזיותרפיסט`, `דיאטנית`,
  `יועצת הנקה` resolve through `professions` and are attached to
  therapists via `therapist_professions`. `professional_title` is kept in
  the therapist DTO for public display only, never as an authoritative
  search source.
- **Modalities** (CBT, EMDR, ACT, DBT, Biofeedback, Play Therapy, Art
  Therapy, etc.) resolve through `treatment_modalities` +
  `therapist_modalities`.
- **Locations** are read from `therapist_locations`, replacing reliance on
  free-text therapist fields. This prepares the ground for future radius
  and map search using the existing lat/long columns (no radius search
  implemented in this phase).

## Future extensibility

The architecture is prepared for additional structured entity types to be
plugged in without redesign:

- clinic, organization, hospital, university, HMO
- language, specialty, certification
- treatment method, insurance affiliation

Each new type will:

1. Add a matcher block inside `runStructuredSearch` (or split into its own
   module and compose via the `types` filter).
2. Add a new union member to `StructuredResult` with `type: "<name>"`.
3. Optionally add a `searchStructured<Type>s` convenience wrapper for
   type-narrowed call sites.

No changes are required to callers that already handle the discriminated
union, and no changes to Semantic Search.

## Relationship to Semantic Search

| Concern                        | Semantic Search                | Structured Search              |
|--------------------------------|--------------------------------|--------------------------------|
| Input                          | Natural-language descriptions  | Named structured entities      |
| Sources                        | Ontology, aliases, intents     | Relational tables of record    |
| Ranking model                  | SemanticEngine (ontology-aware) | Lexical / structured matching |
| Owner                          | `classifyAndSearch`            | `searchStructured`             |
| Modified in P2.1?              | ❌ Untouched                    | ✅ Generalized & renamed       |

The two layers currently run independently. Fusion into a unified ranked
experience is deferred to Phase P6 (Unified Search Experience).

## Backwards compatibility

- Therapist claiming (`/claim`) continues to function exactly as before —
  the same server function shape is used, just under the renamed identifier
  and returning the renamed type.
- Search page (`/search`) continues to render the "matches by name" strip
  identically — internally it now consumes `searchStructuredTherapists`.
- No database schema changes.
- No changes to `SemanticEngine`, `semantic_profile`, ontology, aliases,
  intents, scoring, normalization, matcher, `classifyAndSearch`, or
  `searchTherapists`.

## Files changed

- Added `src/lib/structured-search.functions.ts`
- Removed `src/lib/entity-search.functions.ts`
- Updated `src/routes/search.tsx` (import + variable rename only)
- Updated `src/routes/_authenticated/claim.tsx` (import + type rename only)
- Added `.lovable/reports/platform-p2.1-structured-search.md` (this document)

## Success criteria

- ✅ Structured Search replaces Entity Search as the architectural concept.
- ✅ Professions come from `professions` + `therapist_professions`.
- ✅ Modalities come from `treatment_modalities` + `therapist_modalities`.
- ✅ Locations come from `therapist_locations`.
- ✅ Therapist claiming continues to function unchanged.
- ✅ Semantic search remains completely unchanged.
- ✅ Architecture prepared for future structured entity types without
  redesign.

## Next

- P3 — Therapist Profile Editor
- P4 — Professional Verification
- P5 — Semantic Profile Transparency
- P6 — Unified Search Experience (Structured Search + Semantic Search fusion)
- P7 — Administration & Moderation