REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_therapist_claim(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_claim_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_claim_notification() FROM anon, authenticated;