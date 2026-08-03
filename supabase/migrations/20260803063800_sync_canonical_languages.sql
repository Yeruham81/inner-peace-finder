begin;

-- Canonical language codes are shared by the homepage filters, search API,
-- catalog loader and therapist profile editor. Existing UUIDs are preserved.
with canonical_languages(code, name) as (
  values
    ('he', 'עברית'),
    ('en', 'אנגלית'),
    ('ar', 'ערבית'),
    ('ru', 'רוסית'),
    ('fr', 'צרפתית'),
    ('es', 'ספרדית'),
    ('de', 'גרמנית'),
    ('am', 'אמהרית')
)
update public.languages as language
set name = canonical.name
from canonical_languages as canonical
where language.code = canonical.code;

-- Insert only missing rows. Existing language IDs and therapist relationships
-- are not touched.
with canonical_languages(code, name) as (
  values
    ('he', 'עברית'),
    ('en', 'אנגלית'),
    ('ar', 'ערבית'),
    ('ru', 'רוסית'),
    ('fr', 'צרפתית'),
    ('es', 'ספרדית'),
    ('de', 'גרמנית'),
    ('am', 'אמהרית')
)
insert into public.languages (id, code, name)
select gen_random_uuid(), canonical.code, canonical.name
from canonical_languages as canonical
where not exists (
  select 1
  from public.languages as existing
  where existing.code = canonical.code
);

-- Abort instead of leaving an ambiguous catalog if duplicate canonical codes
-- or missing canonical rows exist.
do $$
begin
  if exists (
    select code
    from public.languages
    where code in ('he', 'en', 'ar', 'ru', 'fr', 'es', 'de', 'am')
    group by code
    having count(*) > 1
  ) then
    raise exception 'Duplicate canonical language codes found in public.languages';
  end if;

  if (
    select count(*)
    from public.languages
    where code in ('he', 'en', 'ar', 'ru', 'fr', 'es', 'de', 'am')
  ) <> 8 then
    raise exception 'Expected all 8 canonical languages in public.languages';
  end if;
end
$$;

commit;
