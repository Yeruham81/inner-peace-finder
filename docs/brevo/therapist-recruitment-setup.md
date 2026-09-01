# Brevo setup — therapist recruitment invitations

1. In Brevo, create an **active email template** (the template used by the API as the campaign content source) using `therapist-recruitment-template.html` and note its numeric template ID. The application still sends the message as a **Marketing email campaign**, not as a transactional email.
2. Create or choose a Brevo Contacts folder that will contain temporary per-send lists and note its numeric folder ID.
3. Add these server environment variables:
   - `BREVO_RECRUITMENT_TEMPLATE_ID=<template id>`
   - `BREVO_RECRUITMENT_FOLDER_ID=<folder id>`
   - existing `BREVO_API_KEY`
   - existing `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS`
   - existing `TIPULINKS_PUBLIC_ORIGIN=https://tipulinks.co.il`
   - existing `BREVO_WEBHOOK_SECRET`
4. Create a **Marketing** Brevo webhook pointing to:
   `https://tipulinks.co.il/api/public/email/recruitment-status`
5. Configure the webhook with the same Authorization header used by the existing Brevo webhook (`Bearer <BREVO_WEBHOOK_SECRET>`).
6. Subscribe it at minimum to: `delivered`, `hardBounce`, `softBounce`, `unsubscribed`, and `spam`.

The application ensures the normal text contact attribute `TIPULINKS_INVITE_URL` exists before the first send, then sets a unique invitation URL on each selected contact.

The daily 100-message limit is enforced atomically in PostgreSQL using the Asia/Jerusalem calendar date. A definite provider rejection before campaign acceptance releases the quota and allows retry on the same invitation row. A bounce, unsubscribe, or unknown send result does not allow automatic retry.

Temporary recipient lists are tracked in `therapist_recruitment_send_batches`. Tipulinks deletes failed-preparation lists immediately when possible and, before later sends, removes Brevo recruitment lists older than seven days. Deleting the list does not delete the Brevo contacts; local invitation/suppression state remains the source of truth for whether an address may ever receive another recruitment invitation.
