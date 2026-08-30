/**
 * Shared WhatsApp lead limits used by both the visitor UI and the server.
 *
 * Keep the message comfortably below Twilio Content Template variable limits
 * so that the fixed template text and other variables still have headroom.
 */
export const WHATSAPP_LEAD_MESSAGE_MIN_LENGTH = 2;
export const WHATSAPP_LEAD_MESSAGE_MAX_LENGTH = 1000;
