import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AccountLayout } from "@/components/account/account-layout";
import { Button } from "@/components/ui/button";
import { ensureTherapistAccount } from "@/lib/therapist-accounts.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [{ title: "החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountRouteLayout,
});

function AccountRouteLayout() {
  const { user } = Route.useRouteContext();
  const ensureFn = useServerFn(ensureTherapistAccount);

  // Use the idempotent ensure call as the account query itself. This avoids a
  // first-visit race where a separate read can finish before account creation.
  const accountQuery = useQuery({
    queryKey: ["therapist-account", user.id],
    queryFn: () => ensureFn(),
  });
  const { isLoading, isError, isFetching } = accountQuery;

  return (
    <AccountLayout wide>
      {isLoading && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground shadow-card">
          טוען את פרטי החשבון…
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
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

      {!isLoading && !isError && <Outlet />}
    </AccountLayout>
  );
}
