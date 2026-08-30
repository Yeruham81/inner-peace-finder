BEGIN;

-- Retire the old search persistence tables together with the Legacy search
-- implementation. Unified Search does not read or write either table.
-- Dropping them also removes any historical free-text searches stored there.
DROP TABLE IF EXISTS public.semantic_search_logs;
DROP TABLE IF EXISTS public.query_classifications;

COMMIT;
