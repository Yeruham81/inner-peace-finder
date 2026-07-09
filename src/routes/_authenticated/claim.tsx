import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTherapistEntities, type TherapistEntityMatch } from "@/lib/entity-search.functions";
import {
  submitClaimRequest,
  cancelClaimRequest,
  listMyClaimRequests,
  getClaimableTherapist,
  type ClaimRequest,
} from "@/lib/therapist-claims.functions";

export const Route = createFileRoute("/_authenticated/claim")({
  head: () => ({
    meta: [
      { title: "שיוך פרופיל מטפל | Tipulinks" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const queryClient = useQueryClient();
  const searchFn = useServerFn(searchTherapistEntities);
  const listFn = useServerFn(listMyClaimRequests);
  const cancelFn = useServerFn(cancelClaimRequest);

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [selected, setSelected] = useState<TherapistEntityMatch | null>(null);

  const results = useQuery({
    queryKey: ["entity-search", submittedQ],
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
          חפשו את הפרופיל שלכם לפי שם, מקצוע או עיר. אם אתם מזהים אותו, שלחו בקשה לשיוך בעלות.
          שיוך אינו מהווה אישור מקצועי — האימות המקצועי נעשה בשלב נפרד.
        </p>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setSubmittedQ(q.trim()); setSelected(null); }}
        >
          <Input
            placeholder="לדוגמה: יעל כהן, קלינאית תקשורת, חיפה"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="חיפוש מטפל"
          />
          <Button type="submit" disabled={q.trim().length < 2}>חיפוש</Button>
        </form>

        <div className="mt-6">
          {results.isFetching && <p className="text-sm text-muted-foreground">מחפש…</p>}
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
                    {r.professional_title}{r.city ? ` · ${r.city}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>בחירה</Button>
              </li>
            ))}
          </ul>
        </div>

        {selected && (
          <ClaimDialog
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
          {claims.data && claims.data.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">עדיין לא שלחת בקשות.</p>
          )}
          <ul className="mt-3 grid gap-2">
            {claims.data?.map((c) => (
              <ClaimRow
                key={c.id}
                claim={c}
                onCancel={() => cancelMut.mutate(c.id)}
                cancelling={cancelMut.isPending}
              />
            ))}
          </ul>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          <Link to="/account" className="underline">חזרה לחשבון</Link>
        </p>
      </div>
    </div>
  );
}

function ClaimDialog({
  therapist,
  onClose,
  onSubmitted,
}: {
  therapist: TherapistEntityMatch;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const submitFn = useServerFn(submitClaimRequest);
  const getFn = useServerFn(getClaimableTherapist);
  const detail = useQuery({
    queryKey: ["claimable", therapist.id],
    queryFn: () => getFn({ data: { therapistId: therapist.id } }),
  });
  const [method, setMethod] = useState("email_domain");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => submitFn({
      data: {
        therapistId: therapist.id,
        verificationMethod: method,
        verificationData: note ? { note } : undefined,
      },
    }),
    onSuccess: onSubmitted,
    onError: (e: Error) => setError(e.message),
  });

  const owned = detail.data?.is_owned;

  return (
    <div className="mt-6 rounded-xl border border-brand/40 bg-brand/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">בקשת שיוך עבור</p>
          <p className="text-lg font-semibold text-foreground">{therapist.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {therapist.professional_title}{therapist.city ? ` · ${therapist.city}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>ביטול</Button>
      </div>

      {owned && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          הפרופיל הזה כבר משויך לחשבון קיים. אם זו טעות, פנו לתמיכה.
        </p>
      )}

      {!owned && (
        <div className="mt-3 grid gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">שיטת אימות מבוקשת</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="email_domain">אימות באמצעות דומיין מייל</option>
              <option value="license_number">מספר רישיון מקצועי</option>
              <option value="manual_review">בדיקה ידנית של הצוות</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">הערה לצוות (אופציונלי)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "שולח…" : "שליחת בקשה"}
            </Button>
            <Button variant="outline" onClick={onClose}>ביטול</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaimRow({
  claim,
  onCancel,
  cancelling,
}: {
  claim: ClaimRequest;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
      <div>
        <p className="font-mono text-xs text-muted-foreground" dir="ltr">{claim.therapist_id}</p>
        <p className="text-sm">
          סטטוס: <span className="font-medium">{claimStatusLabel(claim.status)}</span>
          {claim.verification_method && (
            <span className="text-muted-foreground"> · {claim.verification_method}</span>
          )}
        </p>
      </div>
      {claim.status === "pending" && (
        <Button size="sm" variant="outline" onClick={onCancel} disabled={cancelling}>
          ביטול
        </Button>
      )}
    </li>
  );
}

function claimStatusLabel(s: ClaimRequest["status"]): string {
  switch (s) {
    case "pending": return "ממתין לבדיקה";
    case "approved": return "אושר";
    case "rejected": return "נדחה";
    case "cancelled": return "בוטל";
  }
}