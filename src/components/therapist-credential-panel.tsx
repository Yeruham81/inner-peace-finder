import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { submitMyCredential, type CredentialEditorData } from "@/lib/therapist-profile.functions";
import {
  CREDENTIAL_ACCEPTED_MIME_TYPES,
  aggregateCredentialStatus,
  buildCredentialObjectPath,
  isEditableCredentialStatus,
  validateCredentialUpload,
  type CredentialStatus,
} from "@/lib/credential-workflow";

const BUCKET = "therapist-credentials";

const STATUS_COPY: Record<CredentialStatus, readonly [string, string]> = {
  unverified: ["טרם הוגש", "bg-muted text-muted-foreground"],
  pending_review: ["ממתין לבדיקה", "bg-amber-100 text-amber-900"],
  verified: ["הסמכה מקצועית מאומתת", "bg-emerald-100 text-emerald-900"],
  rejected: ["נדרשים תיקונים", "bg-red-100 text-red-900"],
  expired: ["תוקף ההסמכה פג", "bg-slate-100 text-slate-800"],
};

type DraftState = {
  profession_id: string;
  credential_type: string;
  license_number: string;
  issuing_authority: string;
  institution: string;
  issue_date: string;
  document_url: string;
};

function draftFrom(credential: CredentialEditorData | null): DraftState {
  return {
    profession_id: credential?.profession_id ?? "",
    credential_type: credential?.credential_type ?? "רישיון מקצועי",
    license_number: credential?.license_number ?? "",
    issuing_authority: credential?.issuing_authority ?? "",
    institution: credential?.institution ?? "",
    issue_date: credential?.issue_date ?? "",
    document_url: credential?.document_url ?? "",
  };
}

export function TherapistCredentialPanel({
  therapistId,
  professions,
  credentials,
}: {
  therapistId: string | null;
  professions: { id: string; name_he: string }[];
  credentials: CredentialEditorData[];
}) {
  const aggregate = aggregateCredentialStatus(credentials);
  const [expanded, setExpanded] = useState(aggregate === "rejected" || aggregate === "expired");
  /** `null` = the "add another credential" form; a string = editing that credential id. */
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  const professionName = useMemo(
    () => new Map(professions.map((profession) => [profession.id, profession.name_he])),
    [professions],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-brand/20 bg-brand-soft/25">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="professional-credential-form"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-right transition-colors hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-foreground">
            הסמכה מקצועית מאומתת
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {credentials.length === 0
              ? "בעלי רישיון מקצועי יכולים להגיש פרטי רישיון ומסמך לצורך אימות."
              : `לחצו להצגת ${credentials.length} הסמכות שהוגשו ולהוספת הסמכה נוספת.`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COPY[aggregate][1]}`}
          >
            {STATUS_COPY[aggregate][0]}
          </span>
          <span
            aria-hidden="true"
            className={`text-lg text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ⌄
          </span>
        </span>
      </button>

      {expanded && (
        <div id="professional-credential-form" className="border-t border-brand/20 p-4">
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            הפרטים והמסמך ישמשו לצורך אימות ההכשרה או ההסמכה ולהצגת תגית &quot;מאומת&quot;. הם לא
            יוצגו בגלוי בפרופיל הציבורי.
          </p>

          {credentials.length > 0 && (
            <ul className="mb-4 space-y-3">
              {credentials.map((credential) => {
                const editable = isEditableCredentialStatus(credential.verification_status);
                return (
                  <li key={credential.id} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {credential.credential_type}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            credential.profession_id
                              ? professionName.get(credential.profession_id)
                              : null,
                            credential.issuing_authority,
                            credential.license_number
                              ? `רישיון ${credential.license_number}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COPY[credential.verification_status][1]}`}
                      >
                        {STATUS_COPY[credential.verification_status][0]}
                      </span>
                    </div>
                    {credential.verification_status === "rejected" &&
                      credential.rejection_reason && (
                        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900">
                          סיבת הדחייה: {credential.rejection_reason}
                        </p>
                      )}
                    {credential.verification_status === "verified" ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        הסמכה מאומתת — לא ניתן לעריכה.
                      </p>
                    ) : editable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          setEditing(editing === credential.id ? undefined : credential.id)
                        }
                      >
                        {editing === credential.id ? "סגירת העריכה" : "עריכה ושליחה מחדש"}
                      </Button>
                    ) : null}
                    {editing === credential.id && (
                      <CredentialForm
                        therapistId={therapistId}
                        professions={professions}
                        credential={credential}
                        onDone={() => setEditing(undefined)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editing === null ? (
            <CredentialForm
              therapistId={therapistId}
              professions={professions}
              credential={null}
              onDone={() => setEditing(undefined)}
            />
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {credentials.length === 0 ? "הוספת הסמכה" : "הוספת הסמכה נוספת"}
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
  onDone,
}: {
  therapistId: string | null;
  professions: { id: string; name_he: string }[];
  credential: CredentialEditorData | null;
  onDone: () => void;
}) {
  const submitFn = useServerFn(submitMyCredential);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DraftState>(() => draftFrom(credential));
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          credential_id: credential?.id ?? null,
          profession_id: draft.profession_id,
          credential_type: draft.credential_type,
          institution: draft.institution || null,
          license_number: draft.license_number,
          document_url: draft.document_url,
          issuing_authority: draft.issuing_authority,
          issue_date: draft.issue_date || null,
        },
      }),
    onSuccess: async () => {
      toast.success("הפרטים נשלחו לאימות.");
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את הפרטים לאימות."),
  });

  async function upload(file: File) {
    const check = validateCredentialUpload(file);
    if (!check.ok) return toast.error(check.reason);
    setUploading(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("יש להתחבר מחדש לפני העלאת מסמך.");
      const path = buildCredentialObjectPath(auth.user.id, crypto.randomUUID(), check.extension);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setDraft((current) => ({ ...current, document_url: path }));
      toast.success("המסמך הועלה. יש לשלוח את הפרטים לאימות.");
    } catch (error) {
      toast.error((error as Error).message || "העלאת המסמך נכשלה.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const canSubmit =
    Boolean(therapistId) &&
    Boolean(draft.profession_id) &&
    draft.credential_type.trim().length >= 2 &&
    draft.license_number.trim().length >= 2 &&
    draft.issuing_authority.trim().length >= 2 &&
    Boolean(draft.document_url);

  return (
    <div className="mt-3 border-t border-brand/20 pt-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          מקצוע
          <select
            value={draft.profession_id}
            onChange={(e) => setDraft({ ...draft, profession_id: e.target.value })}
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
            value={draft.credential_type}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, credential_type: e.target.value })}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מספר רישיון
          <Input
            dir="ltr"
            value={draft.license_number}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, license_number: e.target.value })}
            className="mt-1.5 bg-white text-left"
          />
        </label>
        <label className="text-sm font-medium">
          הגוף המנפיק
          <Input
            value={draft.issuing_authority}
            maxLength={160}
            onChange={(e) => setDraft({ ...draft, issuing_authority: e.target.value })}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          מוסד לימודים או הכשרה
          <Input
            value={draft.institution}
            maxLength={160}
            onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
            className="mt-1.5 bg-white"
          />
        </label>
        <label className="text-sm font-medium">
          תאריך קבלת ההסמכה או כניסתה לתוקף
          <Input
            type="date"
            value={draft.issue_date}
            onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })}
            className="mt-1.5 bg-white"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={CREDENTIAL_ACCEPTED_MIME_TYPES.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "המסמך מועלה…" : draft.document_url ? "החלפת מסמך" : "העלאת מסמך"}
        </Button>
        {draft.document_url && <span className="text-sm text-emerald-700">✓ מסמך הועלה</span>}
        {!therapistId && (
          <span className="text-xs text-muted-foreground">יש לבצע תחילה שמירת פרופיל.</span>
        )}
      </div>
      <Button
        type="button"
        className="mt-4"
        disabled={!canSubmit || uploading || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "הבקשה נשלחת…" : "שליחת הפרטים לאימות"}
      </Button>
    </div>
  );
}
