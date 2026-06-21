
DROP INDEX IF EXISTS public.idx_problem_aliases_alias;
DROP INDEX IF EXISTS public.idx_problem_intents_text;
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
CREATE INDEX idx_problem_aliases_alias ON public.problem_aliases USING gin (alias extensions.gin_trgm_ops);
CREATE INDEX idx_problem_intents_text ON public.problem_intents USING gin (intent_text extensions.gin_trgm_ops);
