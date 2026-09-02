import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { TherapistCredentialPanel } from "@/components/therapist-credential-panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getMyAccountUpdateNotificationPreference,
  updateMyAccountUpdateNotificationPreference,
} from "@/lib/account-settings.functions";
import { getMyProfileOnboarding, setMyCredentialVerificationSkip } from "@/lib/profile-onboarding.functions";
import { getEditorOptions, getMyProfile } from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/account/credentials")({
  head: () => ({
    meta: [{ title: "אימות והסמכות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountCredentialsPage,
});

function AccountCredentialsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const getOptionsFn = useServerFn(getEditorOptions);
  const getOnboardingFn = useServerFn(getMyProfileOnboarding);
  const setSkipFn = useServerFn(setMyCredentialVerificationSkip);
  const getNotificationPreferenceFn = useServerFn(getMyAccountUpdateNotificationPreference);
  const updateNotificationPreferenceFn = useServerFn(updateMyAccountUpdateNotificationPreference);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn() });
  const options = useQuery({ queryKey: ["editor-options"], queryFn: () => getOptionsFn() });
  const onboarding = useQuery({
    queryKey: ["profile-onboarding", user.id],
    queryFn: () => getOnboardingFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 3,
  });
  const notificationPreference = useQuery({
    queryKey: ["credential-notification-preference", user.id],
    queryFn: () => getNotificationPreferenceFn(),
  });
  const notificationMutation = useMutation({
    mutationFn: (enabled: boolean) => updateNotificationPreferenceFn({ data: { notify_account_updates: enabled } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["credential-notification-preference", user.id], updated);
      toast.success("העדפת עדכוני האימות נשמרה.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את העדפת האימייל."),
  });
  const skipMutation = useMutation({
    mutationFn: (skip: boolean) => setSkipFn({ data: { skip } }),
    onSuccess: async (_result, skip) => {
      await queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
      toast.success(skip ? "הבחירה נשמרה. הפרופיל ימשיך ללא תגית אימות." : "הבחירה בוטלה. ניתן להעלות מסמך לאימות.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את הבחירה."),
  });

  return (
    <>
      <AccountPageHeader
        eyebrow="אמינות מקצועית"
        title="אימות והסמכות"
        description="העלאת מסמכים מקצועיים, מעקב אחר סטטוס הבדיקה וניהול הסמכות שכבר הוגשו."
      />

      {(profile.isLoading || options.isLoading) && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground shadow-card">
          טוען…
        </div>
      )}

      {(profile.isError || options.isError) && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
          <p className="text-sm font-medium text-destructive">לא הצלחנו לטעון את נתוני ההסמכות.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              if (profile.isError) void profile.refetch();
              if (options.isError) void options.refetch();
            }}
          >
            ניסיון חוזר
          </Button>
        </div>
      )}

      {profile.isSuccess && options.isSuccess && !profile.data && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center shadow-card">
          <BadgeCheck className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">יש ליצור פרופיל לפני הגשת הסמכות</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            ההסמכות מקושרות לפרופיל המטפל, ולכן ניתן להגיש מסמכים לאחר יצירת הפרופיל.
          </p>
          <Button className="mt-5" asChild>
            <Link to="/new-profile" search={{ therapistId: undefined }}>
              יצירת פרופיל
            </Link>
          </Button>
        </div>
      )}

      {profile.isSuccess && options.isSuccess && profile.data && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-card sm:p-6">
          <TherapistCredentialPanel
            therapistId={profile.data.id}
            professions={options.data.professions}
            credentials={profile.data.credentials}
          />
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            סטטוס האימות נקבע על ידי טיפולינקס. מסמכים מאומתים אינם ניתנים לעריכה מתוך החשבון.
          </p>

          {onboarding.isSuccess && onboarding.data.credentialState === "not_started" && (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/25 p-4">
              <h3 className="text-sm font-semibold text-foreground">לא נדרש אימות מקצועי?</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                אפשר להמשיך בתהליך ההצטרפות גם ללא העלאת מסמכים. במקרה כזה לא תוצג בפרופיל תגית אימות, וניתן יהיה להגיש
                מסמכים בהמשך.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={skipMutation.isPending}
                onClick={() => skipMutation.mutate(true)}
              >
                {skipMutation.isPending ? "שומר…" : "המשך ללא אימות מקצועי"}
              </Button>
            </div>
          )}

          {onboarding.isSuccess && onboarding.data.credentialState === "skipped" && (
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex min-w-0 items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">נבחר להמשיך ללא אימות מקצועי</h3>
                  <p className="mt-1 text-xs leading-5 text-emerald-900/80">
                    לא תוצג תגית אימות בפרופיל. אפשר לבטל את הבחירה ולהעלות מסמך בכל עת.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={skipMutation.isPending}
                onClick={() => skipMutation.mutate(false)}
              >
                {skipMutation.isPending ? "שומר…" : "ביטול הבחירה"}
              </Button>
            </div>
          )}

          {onboarding.isError && (
            <p className="mt-4 text-xs text-destructive">לא הצלחנו לטעון את בחירת האימות. ניתן לרענן ולנסות שוב.</p>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface-elevated p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">עדכוני אימות באימייל</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              קבלת אימייל כאשר מסמך הסמכה שהוגש נבדק ואושר או כאשר נדרש עדכון.
            </p>
            {notificationPreference.isError ? (
              <p className="mt-2 text-xs text-destructive">לא ניתן לטעון כרגע את העדפת האימייל.</p>
            ) : null}
          </div>
          <Switch
            checked={notificationPreference.data?.notify_account_updates ?? true}
            disabled={notificationPreference.isLoading || notificationMutation.isPending}
            onCheckedChange={(checked) => notificationMutation.mutate(checked)}
            aria-label="עדכוני אימות באימייל"
          />
        </div>
      </div>
    </>
  );
}
