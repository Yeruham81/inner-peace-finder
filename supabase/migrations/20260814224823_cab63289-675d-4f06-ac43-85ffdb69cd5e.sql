ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_aliases ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.problems TO anon, authenticated;
GRANT SELECT ON public.problem_aliases TO anon, authenticated;
GRANT ALL ON public.problems TO service_role;
GRANT ALL ON public.problem_aliases TO service_role;

DROP POLICY IF EXISTS "Public can read problems" ON public.problems;
CREATE POLICY "Public can read problems"
  ON public.problems FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read problem aliases" ON public.problem_aliases;
CREATE POLICY "Public can read problem aliases"
  ON public.problem_aliases FOR SELECT TO anon, authenticated USING (true);