import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { submitMyCredential, type ProfileEditorData } from "@/lib/therapist-profile.functions";

const BUCKET = "therapist-credentials";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

const STATUS_COPY = {
  unverified: ["טרם הוגש", "bg-muted text-muted-foreground"],
  pending_review: ["ממתין לבדיקה", "bg-amber-100 text-amber-900"],
  verified: ["הסמכה מקצועית מאומתת", "bg-emerald-100 text-emerald-900"],
  rejected: ["נדרשים תיקונים", "bg-red-100 text-red-900"],
  expired: ["תוקף ההסמכה פג", "bg-slate-100 text-slate-800"],
} as const;

export function TherapistCredentialPanel({
  therapistId,
  professions,
  credential,
}: {
  therapistId: string | null;
  professions: { id: string; name_he: string }[];
  credential: ProfileEditorData["credential"];
}) {
  const submitFn = useServerFn(submitMyCredential);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = credential?.verification_status === "verified";
  const [professionId, setProfessionId] = useState(credential?.profession_id ?? "");
  const [credentialType, setCredentialType] = useState(
    credential?.credential_type ?? "רישיון מקצועי",
  );
  const [licenseNumber, setLicenseNumber] = useState(credential?.license_number ?? "");
  const [issuingAuthority, setIssuingAuthority] = useState(credential?.issuing_authority ?? "");
  const [institution, setInstitution] = useState(credential?.institution ?? "");
  const [expiresAt, setExpiresAt] = useState(credential?.expires_at?.slice(0, 10) ?? "");
  const [documentPath, setDocumentPath] = useState(credential?.document_url ?? "");
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          credential_id: credential?.id ?? null,
          profession_id: professionId,
          credential_type: credentialType,
          institution: institution || null,
          license_number: licenseNumber,
          document_url: documentPath,
          issuing_authority: issuingAuthority,
          expires_at: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("ההסמכה נשלחה לבדיקה.");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את ההסמכה לבדיקה."),
  });

  async function upload(file: File) {
    if (!therapistId) return toast.error("יש לבצע שמירת פרופיל לפני העלאת מסמך.");
    if (!ACCEPTED.includes(file.type)) return toast.error("ניתן להעלות PDF, JPG או PNG בלבד.");
    if (file.size > MAX_BYTES) return toast.error("גודל המסמך המרבי הוא 10MB.");
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${therapistId}/credential-${Date.now()}.${extension}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setDocumentPath(path);
      toast.success("המסמך הועלה. יש לשלוח את ההסמכה לבדיקה.");
    } catch (error) {
      toast.error((error as Error).message || "העלאת המסמך נכשלה.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const status = credential?.verification_status ?? "unverified";
  const canSubmit =
    therapistId &&
    professionId &&
    credentialType.trim().length >= 2 &&
    licenseNumber.trim().length >= 2 &&
    issuingAuthority.trim().length >= 2 &&
    documentPath;

  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">הסמכה מקצועית מאומתת</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            הזינו פרטי רישיון והעלו מסמך לצורך בדיקה. פרטי הרישיון והמסמך לא יוצגו לציבור.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COPY[status][1]}`}>
          {STATUS_COPY[status][0]}
        </span>
      </div>
      {credential?.verification_status === "rejected" && credential.rejection_reason && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          סיבת הדחייה: {credential.rejection_reason}
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          מקצוע
          <select
            value={professionId}
            disabled={locked}
            onChange={(e) => setProfessionId(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-white px-3 font-normal"
          >
            <option value="">בחירת מקצוע</option>
            {professions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_he}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          סוג ההסמכה
          <Input
            value={credentialType}
            disabled={locked}
            maxLength={120}
            onChange={(e) => setCredentialType(e.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מספר רישיון
          <Input
            dir="ltr"
            value={licenseNumber}
            disabled={locked}
            maxLength={120}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="mt-1.5 bg-white text-left"
          />
        </label>
        <label className="text-sm font-medium">
          הגוף המנפיק
          <Input
            value={issuingAuthority}
            disabled={locked}
            maxLength={160}
            onChange={(e) => setIssuingAuthority(e.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מוסד לימודים או הכשרה
          <Input
            value={institution}
            disabled={locked}
            maxLength={160}
            onChange={(e) => setInstitution(e.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          תאריך תפוגה, אם קיים
          <Input
            type="date"
            value={expiresAt}
            disabled={locked}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={ACCEPTED.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={locked || uploading || !therapistId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "המסמך מועלה…" : documentPath ? "החלפת מסמך" : "העלאת מסמך"}
        </Button>
        {documentPath && <span className="text-sm text-emerald-700">✓ מסמך הועלה</span>}
        {!therapistId && (
          <span className="text-xs text-muted-foreground">יש לבצע תחילה שמירת פרופיל.</span>
        )}
      </div>
      {!locked && (
        <Button
          type="button"
          className="mt-4"
          disabled={!canSubmit || uploading || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "הבקשה נשלחת…" : "שליחת ההסמכה לבדיקה"}
        </Button>
      )}
    </div>
  );
}
