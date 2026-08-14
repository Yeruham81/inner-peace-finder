/**
 * Pure, client-safe helpers for the therapist credential workflow.
 *
 * Verification decisions are server/administrator-owned: nothing here can
 * set a verification status other than the submission status.
 */

export const CREDENTIAL_STATUSES = [
  "unverified",
  "pending_review",
  "verified",
  "rejected",
  "expired",
] as const;

export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/** Statuses a profile owner may submit or resubmit. */
export const EDITABLE_CREDENTIAL_STATUSES: readonly CredentialStatus[] = [
  "unverified",
  "pending_review",
  "rejected",
];

export function isEditableCredentialStatus(status: CredentialStatus): boolean {
  return EDITABLE_CREDENTIAL_STATUSES.includes(status);
}

/** Section-level precedence: verified > pending_review > rejected > expired > unverified. */
const STATUS_PRECEDENCE: readonly CredentialStatus[] = [
  "verified",
  "pending_review",
  "rejected",
  "expired",
  "unverified",
];

export function aggregateCredentialStatus(
  credentials: { verification_status: CredentialStatus }[],
): CredentialStatus {
  for (const status of STATUS_PRECEDENCE) {
    if (credentials.some((credential) => credential.verification_status === status)) return status;
  }
  return "unverified";
}

export const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024;
export const CREDENTIAL_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export type UploadRejection = { ok: false; reason: string };
export type UploadAcceptance = { ok: true; extension: string };

/** Client-side gate: only PDF/JPEG/PNG up to 10MB. */
export function validateCredentialUpload(file: {
  type: string;
  size: number;
}): UploadAcceptance | UploadRejection {
  if (!(CREDENTIAL_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "ניתן להעלות PDF, JPG או PNG בלבד." };
  }
  if (file.size > CREDENTIAL_MAX_BYTES) return { ok: false, reason: "גודל המסמך המרבי הוא 10MB." };
  return { ok: true, extension: EXTENSION_BY_MIME[file.type] ?? "pdf" };
}

/**
 * Private object path for the credential bucket: `<auth.uid()>/<uuid>.<ext>`.
 * The therapist id is deliberately NOT used as the folder — storage policies
 * are scoped to the authenticated user's own folder.
 */
export function buildCredentialObjectPath(
  authUserId: string,
  fileId: string,
  extension: string,
): string {
  return `${authUserId}/${fileId}.${extension}`;
}

const OWNED_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-zA-Z-]{8,64}\.(pdf|jpg|jpeg|png)$/;

/**
 * Server-side guard: the document path must live inside the authenticated
 * user's own folder, carry a generated filename, and contain no traversal.
 */
export function isOwnedCredentialDocumentPath(path: string, authUserId: string): boolean {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  if (!path.startsWith(`${authUserId}/`)) return false;
  if (path.slice(authUserId.length + 1).includes("/")) return false;
  return OWNED_PATH_PATTERN.test(path.toLowerCase());
}

export type CredentialFileType = "pdf" | "jpg" | "png";

/**
 * Content sniffing by magic bytes. The declared extension / MIME type is
 * attacker-controlled, so the stored bytes decide what the file actually is.
 */
export function detectCredentialFileType(bytes: Uint8Array): CredentialFileType | null {
  const starts = (signature: number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  if (starts([0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return null;
}

/** The sniffed content type must match the extension the path advertises. */
export function credentialPathMatchesType(path: string, type: CredentialFileType): boolean {
  const extension = path.toLowerCase().split(".").pop() ?? "";
  if (type === "jpg") return extension === "jpg" || extension === "jpeg";
  return extension === type;
}
