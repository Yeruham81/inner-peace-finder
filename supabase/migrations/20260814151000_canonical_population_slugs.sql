-- Align population-group slugs with the values emitted by the homepage and
-- keep historical mock relations attached to their canonical group.

UPDATE public.population_groups
SET slug = 'adolescents', name = 'בני נוער', sort_order = 2
WHERE slug = 'teens'
  AND NOT EXISTS (SELECT 1 FROM public.population_groups WHERE slug = 'adolescents');

UPDATE public.population_groups
SET slug = 'older-adults', name = 'הגיל השלישי', sort_order = 5
WHERE slug = 'elderly'
  AND NOT EXISTS (SELECT 1 FROM public.population_groups WHERE slug = 'older-adults');

-- If both a historical and canonical row already exist, merge every relation
-- before removing the historical row. This also makes the migration safe on
-- databases that were partially corrected by hand.
DO $$
DECLARE
  slug_pair record;
  source_id public.population_groups.id%TYPE;
  target_id public.population_groups.id%TYPE;
BEGIN
  FOR slug_pair IN
    SELECT * FROM (VALUES
      ('toddlers', 'infants'),
      ('babies-toddlers', 'infants'),
      ('teens', 'adolescents'),
      ('elderly', 'older-adults')
    ) AS pairs(source_slug, target_slug)
  LOOP
    source_id := NULL;
    target_id := NULL;
    SELECT id INTO source_id FROM public.population_groups WHERE slug = slug_pair.source_slug;
    SELECT id INTO target_id FROM public.population_groups WHERE slug = slug_pair.target_slug;

    IF source_id IS NOT NULL AND target_id IS NOT NULL AND source_id <> target_id THEN
      INSERT INTO public.therapist_populations (therapist_id, population_id)
      SELECT therapist_id, target_id
      FROM public.therapist_populations
      WHERE population_id = source_id
      ON CONFLICT DO NOTHING;

      DELETE FROM public.therapist_populations WHERE population_id = source_id;

      DELETE FROM public.therapist_problems source
      USING public.therapist_problems target
      WHERE source.population_id = source_id
        AND target.population_id = target_id
        AND source.therapist_id = target.therapist_id
        AND source.problem_id = target.problem_id;

      UPDATE public.therapist_problems
      SET population_id = target_id
      WHERE population_id = source_id;

      UPDATE public.analytics_events SET population_id = target_id WHERE population_id = source_id;
      UPDATE public.lead_events SET population_id = target_id WHERE population_id = source_id;
      DELETE FROM public.population_groups WHERE id = source_id;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.population_groups (slug, name, sort_order)
VALUES
  ('infants', 'תינוקות ופעוטות', 0),
  ('children', 'ילדים', 1),
  ('adolescents', 'בני נוער', 2),
  ('young-adults', 'צעירים', 3),
  ('adults', 'מבוגרים', 4),
  ('older-adults', 'הגיל השלישי', 5),
  ('couples', 'זוגות', 6),
  ('parents-families', 'הורים ומשפחות', 7)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;
