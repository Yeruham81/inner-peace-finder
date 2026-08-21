import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck } from "lucide-react";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { TherapistCredentialPanel } from "@/components/therapist-credential-panel";
import { Button } from "@/components/ui/button";
import { getEditorOptions, getMyProfile } from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/account/credentials")({
  head: () => ({
    meta: [{ title: "אימות והסמכות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountCredentialsPage,
});

function AccountCredentialsPage() {
  const getProfileFn = useServerFn(getMyProfile);
  const getOptionsFn = useServerFn(getEditorOptions);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn() });
  const options = useQuery({ queryKey: ["editor-options"], queryFn: () => getOptionsFn() });

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
        </div>
      )}
    </>
  );
}
