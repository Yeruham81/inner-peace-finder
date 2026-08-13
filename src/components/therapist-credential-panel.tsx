import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  submitMyCredential,
  type CredentialEditorData,
  type ProfileEditorData,
} from "@/lib/therapist-profile.functions";

const BUCKET = "therapist-credentials";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

const STATUS_COPY = {
  unverified: ["טרם הוגש", "bg-muted text-muted-foreground"],
  pending_review: ["ממתין לאימות", "bg-amber-100 text-amber-900"],
  verified: ["מאומת", "bg-emerald-100 text-emerald-900"],
  rejected: ["נדחה", "bg-red-100 text-red-900"],
  expired: ["פג תוקף", "bg-slate-100 text-slate-800"],
} as const;

type CredentialStatus = CredentialEditorData["verification_status"];

function overallStatus(credentials: CredentialEditorData[]): CredentialStatus {
  if (credentials.some((credential) => credential.verification_status === "verified")) return "verified";
  if (credentials.some((credential) => credential.verification_status === "pending_review")) return "pending_review";
  if (credentials.some((credential) => credential.verification_status === "rejected")) return "rejected";
  if (credentials.some((credential) => credential.verification_status === "expired")) return "expired";
  return "unverified";
}

function StatusBadge({ status }: { status: CredentialStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COPY[status][1]}`}>
      {STATUS_COPY[status][0]}
    </span>
  );
}

export function TherapistCredentialPanel({
  therapistId,
  professions,
  credentials,
}: {
  therapistId: string | null;
  professions: { id: string; name_he: string }[];
  credentials: ProfileEditorData["credentials"];
}) {
  const status = overallStatus(credentials);
  const [expanded, setExpanded] = useState(credentials.length === 0 || status === "rejected" || status === "expired");
  const [activeCredentialId, setActiveCredentialId] = useState<string | null>(credentials.length === 0 ? "new" : null);
  const activeCredential = credentials.find((credential) => credential.id === activeCredentialId);

  return (
    <div className="overflow-hidden rounded-xl border border-brand/20 bg-brand-soft/25">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="professional-credentials"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-right transition-colors hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-foreground">הסמכה מקצועית מאומתת</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {credentials.length === 0
              ? "בעלי רישיון מקצועי יכולים להגיש פרטי רישיון ומסמך לצורך אימות."
              : `${credentials.length} הסמכות הוגשו או נשמרו במערכת.`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge status={status} />
          <span
            aria-hidden="true"
            className={`text-lg text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ⌄
          </span>
        </span>
      </button>

      {expanded && (
        <div id="professional-credentials" className="space-y-4 border-t border-brand/20 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            הפרטים והמסמך ישמשו לצורך אימות ההכשרה או ההסמכה ולהצגת תגית &quot;מאומת&quot;. הם לא יוצגו בגלוי בפרופיל
            הציבורי.
          </p>

          {credentials.length > 0 && (
            <div className="space-y-2">
              {credentials.map((credential, index) => {
                const profession = professions.find((item) => item.id === credential.profession_id)?.name_he;
                const canEdit =
                  credential.verification_status === "unverified" ||
                  credential.verification_status === "pending_review" ||
                  credential.verification_status === "rejected";
                return (
                  <div key={credential.id} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {credential.credential_type || `הסמכה ${index + 1}`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[profession, credential.issuing_authority, credential.license_number]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={credential.verification_status} />
                        {canEdit && activeCredentialId !== credential.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveCredentialId(credential.id)}
                          >
                            עריכת פרטים
                          </Button>
                        )}
                      </div>
                    </div>
                    {credential.verification_status === "rejected" && credential.rejection_reason && (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900">
                        סיבת הדחייה: {credential.rejection_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeCredentialId && (
            <CredentialForm
              key={activeCredentialId}
              therapistId={therapistId}
              professions={professions}
              credential={activeCredential}
              canCancel={credentials.length > 0}
              onCancel={() => setActiveCredentialId(null)}
              onSubmitted={() => setActiveCredentialId(null)}
            />
          )}

          {!activeCredentialId && (
            <Button type="button" variant="outline" onClick={() => setActiveCredentialId("new")}>
              הוספת הסמכה נוספת
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CredentialForm({
  therapistId,
  professions,
  credential,
  canCancel,
  onCancel,
  onSubmitted,
}: {
  therapistId: string | null;
  professions: { id: string; name_he: string }[];
  credential?: CredentialEditorData;
  canCancel: boolean;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const submitFn = useServerFn(submitMyCredential);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [professionId, setProfessionId] = useState(credential?.profession_id ?? "");
  const [credentialType, setCredentialType] = useState(credential?.credential_type ?? "רישיון מקצועי");
  const [licenseNumber, setLicenseNumber] = useState(credential?.license_number ?? "");
  const [issuingAuthority, setIssuingAuthority] = useState(credential?.issuing_authority ?? "");
  const [institution, setInstitution] = useState(credential?.institution ?? "");
  const [issueDate, setIssueDate] = useState(credential?.issue_date ?? "");
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
          issue_date: issueDate || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("הפרטים נשלחו לאימות. אפשר להוסיף הסמכה נוספת.");
      onSubmitted();
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את הפרטים לאימות."),
  });

  async function upload(file: File) {
    if (!therapistId) return toast.error("יש לבצע שמירת פרופיל לפני העלאת מסמך.");
    if (!ACCEPTED.includes(file.type)) return toast.error("ניתן להעלות PDF, JPG או PNG בלבד.");
    if (file.size > MAX_BYTES) return toast.error("גודל המסמך המרבי הוא 10MB.");
    setUploading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("לא ניתן לזהות את המשתמש המחובר.");
      const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setDocumentPath(path);
      toast.success("המסמך הועלה. יש לשלוח את הפרטים לאימות.");
    } catch (error) {
      toast.error((error as Error).message || "העלאת המסמך נכשלה.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const canSubmit = Boolean(
    therapistId &&
    professionId &&
    credentialType.trim().length >= 2 &&
    licenseNumber.trim().length >= 2 &&
    issuingAuthority.trim().length >= 2 &&
    documentPath,
  );

  return (
    <div className="rounded-lg border border-brand/20 bg-white/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">{credential ? "עריכת פרטי הסמכה" : "הסמכה נוספת"}</h3>
        {credential && <StatusBadge status={credential.verification_status} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">
          מקצוע
          <select
            value={professionId}
            onChange={(event) => setProfessionId(event.target.value)}
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
            maxLength={120}
            onChange={(event) => setCredentialType(event.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מספר רישיון
          <Input
            dir="ltr"
            value={licenseNumber}
            maxLength={120}
            onChange={(event) => setLicenseNumber(event.target.value)}
            className="mt-1.5 bg-white text-left"
          />
        </label>
        <label className="text-sm font-medium">
          הגוף המנפיק
          <Input
            value={issuingAuthority}
            maxLength={160}
            onChange={(event) => setIssuingAuthority(event.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מוסד לימודים או הכשרה
          <Input
            value={institution}
            maxLength={160}
            onChange={(event) => setInstitution(event.target.value)}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          תאריך קבלת ההסמכה או כניסתה לתוקף
          <Input
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
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
          disabled={uploading || !therapistId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "המסמך מועלה…" : documentPath ? "החלפת מסמך" : "העלאת מסמך"}
        </Button>
        {documentPath && <span className="text-sm text-emerald-700">✓ מסמך הועלה</span>}
        {!therapistId && <span className="text-xs text-muted-foreground">יש לבצע תחילה שמירת פרופיל.</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!canSubmit || uploading || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "הבקשה נשלחת…" : "שליחת הפרטים לאימות"}
        </Button>
        {canCancel && (
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>
            ביטול
          </Button>
        )}
      </div>
    </div>
  );
}
