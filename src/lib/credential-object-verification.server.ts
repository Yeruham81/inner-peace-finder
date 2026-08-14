/**
 * Server-only verification of an uploaded credential document.
 *
 * The client tells us a storage path; everything else about that object is
 * verified here against the actual stored bytes. A path that does not exist,
 * is oversized, is empty, or whose content does not match an accepted document
 * type is rejected before any credential row is written.
 */
import {
  CREDENTIAL_MAX_BYTES,
  credentialPathMatchesType,
  detectCredentialFileType,
  isOwnedCredentialDocumentPath,
  type CredentialFileType,
} from "./credential-workflow";

export const CREDENTIAL_BUCKET = "therapist-credentials" as const;

export type VerifiedCredentialObject = {
  path: string;
  size: number;
  type: CredentialFileType;
};

export async function verifyStoredCredentialObject(
  path: string,
  authUserId: string,
): Promise<VerifiedCredentialObject> {
  // Ownership of the path itself (own folder, generated filename, no traversal).
  if (!isOwnedCredentialDocumentPath(path, authUserId)) {
    throw new Error("נתיב המסמך אינו תקין.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: blob, error } = await supabaseAdmin.storage.from(CREDENTIAL_BUCKET).download(path);
  if (error || !blob) {
    throw new Error("לא נמצא מסמך הסמכה בנתיב שנשלח. יש להעלות את המסמך מחדש.");
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("מסמך ההסמכה ריק.");
  if (bytes.byteLength > CREDENTIAL_MAX_BYTES) throw new Error("גודל המסמך המרבי הוא 10MB.");

  const type = detectCredentialFileType(bytes);
  if (!type) throw new Error("ניתן להעלות PDF, JPG או PNG בלבד.");
  if (!credentialPathMatchesType(path, type)) {
    throw new Error("סוג המסמך אינו תואם את הקובץ שהועלה.");
  }

  return { path, size: bytes.byteLength, type };
}
