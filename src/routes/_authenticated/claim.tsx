import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchStructuredTherapists, type TherapistStructuredResult } from "@/lib/structured-search.functions";
import {
  submitClaimRequest,
  cancelClaimRequest,
  listMyClaimRequests,
  getClaimableTherapist,
  listProfessions,
  type ClaimRequestType,
  type ClaimRequestWithTherapist,
  type VerificationMethod,
} from "@/lib/therapist-claims.functions";

export const Route = createFileRoute("/_authenticated/claim")({
  head: () => ({
    meta: [{ title: "שיוך פרופיל מטפל | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const queryClient = useQueryClient();
  const searchFn = useServerFn(searchStructuredTherapists);
  const listFn = useServerFn(listMyClaimRequests);
  const cancelFn = useServerFn(cancelClaimRequest);

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [selected, setSelected] = useState<TherapistStructuredResult | null>(null);

  const results = useQuery({
    queryKey: ["structured-search", "therapist", submittedQ],
    queryFn: () => searchFn({ data: { query: submittedQ } }),
    enabled: submittedQ.length >= 2,
  });

  const claims = useQuery({
    queryKey: ["my-claims"],
    queryFn: () => listFn(),
  });

  const cancelMut = useMutation({
    mutationFn: (claimId: string) => cancelFn({ data: { claimId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-claims"] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">שיוך פרופיל מטפל קיים</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          הזינו את שמכם כדי לאתר את הפרופיל שלכם. שיוך פרופיל אינו מהווה אישור מקצועי — האימות המקצועי נעשה בשלב נפרד.
        </p>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQ(q.trim());
            setSelected(null);
          }}
        >
          <Input
            placeholder="הקלידו את שמכם המלא"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="חיפוש מטפל"
            autoComplete="off"
          />
          <Button type="submit" disabled={q.trim().length < 2}>
            חיפוש
          </Button>
        </form>

        <div className="mt-6">
          {results.isFetching && <p className="text-sm text-muted-foreground">מחפש…</p>}
          {results.isError && (
            <InlineQueryError
              message="לא הצלחנו לבצע את החיפוש."
              retrying={results.isFetching}
              onRetry={() => void results.refetch()}
            />
          )}
          {results.data && results.data.length === 0 && (
            <p className="text-sm text-muted-foreground">לא נמצאו פרופילים תואמים.</p>
          )}
          <ul className="grid gap-2">
            {results.data?.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
              >
                <div>
                  <p className="font-medium text-foreground">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.professional_title}
                    {r.city ? ` · ${r.city}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                  בחירה
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {selected && (
          <ActionPicker
            therapist={selected}
            onClose={() => setSelected(null)}
            onSubmitted={() => {
              setSelected(null);
              queryClient.invalidateQueries({ queryKey: ["my-claims"] });
            }}
          />
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">הבקשות שלי</h2>
          {claims.isLoading && <p className="mt-2 text-sm text-muted-foreground">טוען…</p>}
          {claims.isError && (
            <InlineQueryError
              message="לא הצלחנו לטעון את הבקשות."
              retrying={claims.isFetching}
              onRetry={() => void claims.refetch()}
            />
          )}
          {cancelMut.isError && (
            <p className="mt-2 text-sm text-destructive">לא הצלחנו לבטל את הבקשה. ניתן לנסות שוב.</p>
          )}
          {claims.data && claims.data.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">עדיין לא שלחת בקשות.</p>
          )}
          <ul className="mt-3 grid gap-2">
            {claims.data?.map((c) => (
              <ClaimRow key={c.id} claim={c} onCancel={() => cancelMut.mutate(c.id)} cancelling={cancelMut.isPending} />
            ))}
          </ul>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          <Link to="/account" className="underline">
            חזרה לחשבון
          </Link>
        </p>
      </div>
    </div>
  );
}

function ActionPicker({
  therapist,
  onClose,
  onSubmitted,
}: {
  therapist: TherapistStructuredResult;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const getFn = useServerFn(getClaimableTherapist);
  const detail = useQuery({
    queryKey: ["claimable", therapist.id],
    queryFn: () => getFn({ data: { therapistId: therapist.id } }),
  });
  const [action, setAction] = useState<ClaimRequestType | null>(null);
  const owned = detail.data?.is_owned;

  return (
    <div className="mt-6 rounded-xl border border-brand/40 bg-brand/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">פרופיל שנבחר</p>
          <p className="text-lg font-semibold text-foreground">{therapist.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {therapist.professional_title}
            {therapist.city ? ` · ${therapist.city}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          סגירה
        </Button>
      </div>

      {detail.isLoading && <p className="mt-3 text-sm text-muted-foreground">בודק את פרטי הפרופיל…</p>}
      {detail.isError && (
        <InlineQueryError
          message="לא הצלחנו לבדוק את מצב הפרופיל."
          retrying={detail.isFetching}
          onRetry={() => void detail.refetch()}
        />
      )}
      {detail.isSuccess && !detail.data && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          הפרופיל שנבחר אינו זמין עוד.
        </p>
      )}

      {detail.isSuccess && detail.data && owned && action !== "remove_profile" && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          הפרופיל הזה כבר משויך לחשבון קיים. אם זו טעות, פנו לתמיכה.
        </p>
      )}

      {detail.isSuccess && detail.data && !action && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">מה תרצו לעשות?</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              disabled={owned}
              onClick={() => setAction("claim_profile")}
              className="rounded-lg border border-border bg-surface p-3 text-right transition hover:border-brand disabled:opacity-50"
            >
              <div className="font-semibold text-foreground">שיוך פרופיל מטפל קיים</div>
              <p className="mt-1 text-xs text-muted-foreground">חיבור החשבון לפרופיל שכבר קיים באתר.</p>
            </button>
            <button
              type="button"
              onClick={() => setAction("remove_profile")}
              className="rounded-lg border border-border bg-surface p-3 text-right transition hover:border-brand"
            >
              <div className="font-semibold text-foreground">בקשה להסרת הפרופיל</div>
              <p className="mt-1 text-xs text-muted-foreground">
                אתם המטפל בפרופיל אך אינכם מעוניינים להופיע — נסתיר את הפרופיל לאחר אימות.
              </p>
            </button>
          </div>
        </div>
      )}

      {detail.isSuccess && detail.data && action && (
        <VerificationForm
          therapist={therapist}
          requestType={action}
          onBack={() => setAction(null)}
          onSubmitted={onSubmitted}
        />
      )}
    </div>
  );
}

function VerificationForm({
  therapist,
  requestType,
  onBack,
  onSubmitted,
}: {
  therapist: TherapistStructuredResult;
  requestType: ClaimRequestType;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const submitFn = useServerFn(submitClaimRequest);
  const profFn = useServerFn(listProfessions);
  const [method, setMethod] = useState<VerificationMethod | null>(null);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [professionalEmail, setProfessionalEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const professions = useQuery({
    queryKey: ["professions"],
    queryFn: () => profFn(),
    enabled: method === "license_number",
  });

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          therapistId: therapist.id,
          requestType,
          verificationMethod: method!,
          licenseNumber: licenseNumber || undefined,
          professionId: professionId || undefined,
          professionalEmail: professionalEmail || undefined,
          note: note || undefined,
        },
      }),
    onSuccess: onSubmitted,
    onError: (e: Error) => setError(e.message),
  });

  const submitLabel = requestType === "remove_profile" ? "שליחת בקשה להסרת פרופיל" : "שליחת בקשת שיוך";

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {requestType === "remove_profile" ? "בחרו שיטת אימות להסרת הפרופיל" : "בחרו שיטת אימות בעלות"}
        </p>
        <button type="button" onClick={onBack} className="text-xs text-muted-foreground underline">
          חזרה
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <MethodChip active={method === "license_number"} onClick={() => setMethod("license_number")}>
          מספר רישיון מקצועי
        </MethodChip>
        <MethodChip active={method === "professional_email"} onClick={() => setMethod("professional_email")}>
          כתובת מייל מקצועית
        </MethodChip>
        <MethodChip active={method === "manual_review"} onClick={() => setMethod("manual_review")}>
          בדיקה ידנית של צוות האתר
        </MethodChip>
      </div>

      {method === "license_number" && (
        <div className="grid gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">מספר רישיון מקצועי</label>
            <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">מקצוע</label>
            {professions.isError && (
              <InlineQueryError
                message="לא הצלחנו לטעון את רשימת המקצועות."
                retrying={professions.isFetching}
                onRetry={() => void professions.refetch()}
              />
            )}
            <select
              value={professionId}
              onChange={(e) => setProfessionId(e.target.value)}
              disabled={professions.isLoading || professions.isError}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">{professions.isLoading ? "טוען מקצועות…" : "בחרו מקצוע…"}</option>
              {professions.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_he}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {method === "professional_email" && (
        <div>
          <label className="text-sm font-medium text-foreground">כתובת מייל מקצועית</label>
          <Input
            type="email"
            dir="ltr"
            value={professionalEmail}
            onChange={(e) => setProfessionalEmail(e.target.value)}
            placeholder="name@clinic.co.il"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            צוות האתר יבדוק את הכתובת לצורך אימות. אין חובה להשתמש במייל מקצועי.
          </p>
        </div>
      )}

      {method === "manual_review" && (
        <div>
          <label className="text-sm font-medium text-foreground">הערה לצוות (לא חובה)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="כתבו מידע שיכול לעזור לנו לבדוק את הבקשה."
          />
        </div>
      )}

      {method && (
        <>
          <p className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            לאחר שליחת הבקשה, צוות האתר יבדוק את הפרטים. תהליך האימות עשוי להימשך עד 24 שעות.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !isFormValid(method, { licenseNumber, professionId, professionalEmail })}
            >
              {submit.isPending ? "שולח…" : submitLabel}
            </Button>
            <Button variant="outline" onClick={onBack}>
              חזרה
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function isFormValid(
  method: VerificationMethod,
  v: { licenseNumber: string; professionId: string; professionalEmail: string },
): boolean {
  if (method === "license_number") return v.licenseNumber.trim().length >= 2 && !!v.professionId;
  if (method === "professional_email") return /.+@.+\..+/.test(v.professionalEmail.trim());
  return true;
}

function InlineQueryError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-1 text-xs font-medium text-primary underline disabled:opacity-60"
      >
        {retrying ? "מנסה שוב…" : "ניסיון חוזר"}
      </button>
    </div>
  );
}

function MethodChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm transition ${
        active
          ? "border-brand bg-brand/10 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-brand/50"
      }`}
    >
      {children}
    </button>
  );
}

function ClaimRow({
  claim,
  onCancel,
  cancelling,
}: {
  claim: ClaimRequestWithTherapist;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const canCancel = claim.status === "pending" || claim.status === "needs_information";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {requestTypeLabel(claim.request_type)}
          {claim.therapist_full_name ? ` — ${claim.therapist_full_name}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {verificationMethodLabel(claim.verification_method)} ·{" "}
          {new Date(claim.created_at).toLocaleDateString("he-IL")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChipClass(claim.status)}`}>
          {claimStatusLabel(claim.status)}
        </span>
        {canCancel && (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={cancelling}>
            ביטול
          </Button>
        )}
      </div>
    </li>
  );
}

function requestTypeLabel(t: ClaimRequestType): string {
  return t === "remove_profile" ? "בקשה להסרת הפרופיל" : "שיוך פרופיל מטפל";
}

function verificationMethodLabel(m: string | null): string {
  switch (m) {
    case "license_number":
      return "אימות באמצעות מספר רישיון מקצועי";
    case "professional_email":
      return "אימות באמצעות כתובת מייל מקצועית";
    case "manual_review":
      return "בדיקה ידנית של צוות האתר";
    default:
      return "שיטת אימות לא צוינה";
  }
}

function claimStatusLabel(s: ClaimRequestWithTherapist["status"]): string {
  switch (s) {
    case "pending":
      return "ממתין לבדיקה";
    case "needs_information":
      return "נדרש מידע נוסף";
    case "approved":
      return "אושר";
    case "rejected":
      return "נדחה";
    case "cancelled":
      return "בוטל";
    default:
      return s;
  }
}

function statusChipClass(s: string): string {
  switch (s) {
    case "approved":
      return "bg-emerald-100 text-emerald-800";
    case "rejected":
      return "bg-destructive/10 text-destructive";
    case "needs_information":
      return "bg-amber-100 text-amber-800";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-brand/10 text-primary";
  }
}
