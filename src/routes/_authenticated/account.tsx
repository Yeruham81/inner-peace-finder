import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ensureTherapistAccount } from "@/lib/therapist-accounts.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [{ title: "החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ensureFn = useServerFn(ensureTherapistAccount);

  // Use the idempotent ensure call as the account query itself. This avoids a
  // first-visit race where a separate read can finish before account creation.
  const accountQuery = useQuery({
    queryKey: ["therapist-account", user.id],
    queryFn: () => ensureFn(),
  });
  const { data: account, isLoading, isError, isFetching } = accountQuery;

  async function handleSignOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-soft/50 via-background to-brand-soft/50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">החשבון שלי</h1>
              <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
                {user.email}
              </p>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              יציאה
            </Button>
          </div>

          <div className="mt-6 grid gap-3 text-sm">
            {isLoading && <p className="text-muted-foreground">טוען…</p>}
            {isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="font-medium text-destructive">לא הצלחנו לטעון את פרטי החשבון.</p>
                <p className="mt-1 text-xs text-muted-foreground">ניתן לנסות שוב.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={isFetching}
                  onClick={() => void accountQuery.refetch()}
                >
                  {isFetching ? "מנסה שוב…" : "ניסיון חוזר"}
                </Button>
              </div>
            )}
            {account && (
              <>
                <Row label="סטטוס חשבון" value={statusLabel(account.account_status)} />
                <Row label="השלמת אונבורדינג" value={account.onboarding_completed ? "הושלם" : "בתהליך"} />
                <Row label="פרופיל מטפל" value={account.owned_therapist_id ? "מקושר" : "עדיין לא שויך פרופיל"} />
              </>
            )}
          </div>

          {!isLoading &&
            !isError &&
            account &&
            (account.owned_therapist_id ? (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">הפרופיל שלי</h2>
                <Link
                  to="/new-profile"
                  className="mt-3 block rounded-xl border border-border bg-surface p-4 text-right transition hover:border-brand hover:bg-brand/5"
                >
                  <div className="text-base font-semibold text-foreground">עריכת פרופיל</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    עדכנו את פרטי הפרופיל, שמרו טיוטה או פרסמו את הפרופיל.
                  </p>
                </Link>
              </div>
            ) : (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">כיצד תרצו להתחיל?</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Link
                    to="/claim"
                    className="rounded-xl border border-border bg-surface p-4 text-right transition hover:border-brand hover:bg-brand/5"
                  >
                    <div className="text-base font-semibold text-foreground">שיוך פרופיל מטפל קיים</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      כבר מופיעים באתר? מצאו את הפרופיל שלכם ובצעו אימות בעלות.
                    </p>
                  </Link>
                  <Link
                    to="/new-profile"
                    className="rounded-xl border border-border bg-surface p-4 text-right transition hover:border-brand hover:bg-brand/5"
                  >
                    <div className="text-base font-semibold text-foreground">יצירת פרופיל מטפל חדש</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      אין לכם עדיין פרופיל? צרו פרופיל מקצועי חדש והתחילו להופיע באתר.
                    </p>
                  </Link>
                </div>
              </div>
            ))}

          <p className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="underline">
              חזרה לעמוד הבית
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-none">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "pending":
      return "ממתין";
    case "active":
      return "פעיל";
    case "claimed":
      return "שויך פרופיל";
    case "suspended":
      return "מושהה";
    default:
      return s;
  }
}
