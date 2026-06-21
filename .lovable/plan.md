## MVP: Problem-First Therapist Discovery (Anxiety) — Hebrew/RTL

### Stack
- TanStack Start + Lovable Cloud (Supabase) — enable Cloud first
- Hebrew UI, `dir="rtl"` on `<html>`, mobile-first healthcare design (calm neutrals + soft accent; Heebo/Assistant font)
- Numbers/phone wrapped with `dir="ltr"` spans

### Database (migration)
Fully relational schema with GRANTs + RLS:

- `therapists` — full_name, professional_title, short_intro, full_description, years_experience, city, region, country (default 'Israel'), latitude, longitude, image_url, license_number (UNIQUE), phone, verified, profile_claimed, slug (unique, generated), created_at
- `problems` — name, slug (unique), parent_id (self-FK)
- `problem_aliases` — alias, problem_id
- `problem_intents` — intent_text, problem_id (semantic NL layer)
- `therapist_problems` — therapist_id, problem_id, population_id (nullable)
- `languages` + `therapist_languages`
- `population_groups` (toddlers/children/teens/adults/elderly) + `therapist_populations`
- `cta_clicks` — therapist_id, session_id, ip_hash, user_agent, source_problem_id, created_at
  - Partial unique index enforcing **1 billable click per (therapist, session) per 24h** via `date_trunc('day', created_at)` window check in insert server fn

**RLS**:
- Public SELECT on therapists/problems/aliases/intents/joins/languages/populations (anon read-only)
- `cta_clicks` INSERT only via server function (service role); no public select

**Seed (in migration)**:
- Anxiety parent + 9 subtypes with Hebrew names & slugs
- Hebrew aliases + intent phrases per subtype (e.g., "פאניקה לפני עבודה" → Panic / Work Anxiety; "מחשבות טורדניות" → GAD)
- 5 population groups, common languages (עברית, English, ערבית, רוסית)
- ~12 demo therapists across Tel Aviv/Jerusalem/Haifa with problem/population/language links

### Server functions (`src/lib/*.functions.ts`)
- `searchTherapists({ query?, problemSlug?, city?, populationSlug?, languageCode? })` — uses publishable server client
  - Intent match: ILIKE query against `problem_intents.intent_text` + `problem_aliases.alias` + `problems.name`
  - Returns therapists with computed score (subtype 50 / parent 25 / intent 20 / population 15 / city 10 / +years/2 / +verified 5), sorted desc
- `getProblemBySlug(slug)` — problem + child problems + matching therapists
- `getTherapistBySlug(slug)` — full profile with joins
- `recordCtaClick({ therapistId, sourceProblemId? })` — hashes IP (sha256 + salt), reads session_id cookie (set if missing), enforces 24h dedupe before insert
- `listProblems()` / `listCities()` / `listPopulations()` / `listLanguages()` — filter options

### Routes
- `/` — Hebrew hero, large search box, popular problems chips, filters
- `/search` — results page with filter sidebar/sheet
- `/problems/$slug` — problem explanation + therapist list
- `/therapists/$slug` — profile + "התקשר למטפל" CTA (calls `recordCtaClick`, then `tel:` link)
- Dynamic `sitemap.xml` enumerating problems + therapists; `robots.txt`

### Design
- Tokens in `src/styles.css` (oklch): warm off-white bg, deep teal primary, soft coral accent, generous spacing
- Components: `SearchBar`, `TherapistCard`, `ProblemChip`, `FilterPanel`, `CtaCallButton`
- All Hebrew copy; semantic tokens only, no hardcoded colors

### Out of scope (MVP)
- Auth / therapist self-claim flow (schema ready via `profile_claimed`)
- Payments dashboard (cta_clicks ready to bill)
- True vector embeddings (intent table covers MVP; pgvector can be added later without refactor)

Proceeding to enable Lovable Cloud, write the migration, build server fns, then routes & UI.
