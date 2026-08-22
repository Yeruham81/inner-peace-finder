import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Mail, MessageCircle, Phone, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteMyAccountPermanently,
  getMyProfile,
  updateMyContactPreferences,
  type ContactMethod,
} from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({
    meta: [{ title: "הגדרות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountSettingsPage,
});

const CONTACT_METHOD_OPTIONS: readonly {
  id: ContactMethod;
  label: string;
  description: string;
  icon: typeof Mail;
}[] = [
  { id: "email", label: "אימייל", description: "קבלת פניות כתובות באימייל", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", description: "קבלת הודעות ב-WhatsApp", icon: MessageCircle },
  { id: "phone", label: "שיחת טלפון", description: "קבלת שיחה בחיוג טלפוני", icon: Phone },
];

type ContactPreferencesState = {
  email: string;
  phone: string;
  contact_methods: ContactMethod[];
  preferred_contact_method: ContactMethod;
};

function AccountSettingsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const updateContactFn = useServerFn(updateMyContactPreferences);
  const deleteAccountFn = useServerFn(deleteMyAccountPermanently);

  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getProfileFn(),
  });

  const [contactPreferences, setContactPreferences] = useState<ContactPreferencesState>({
    email: user.email ?? "",
    phone: "",
    contact_methods: ["email"],
    preferred_contact_method: "email",
  });
  const [contactInitialized, setContactInitialized] = useState(false);
  const [loginEmail, setLoginEmail] = useState(user.email ?? "");
  const [loginEmailRequestSent, setLoginEmailRequestSent] = useState(false);

  useEffect(() => {
    if (contactInitialized || !profile.isSuccess) return;

    const data = profile.data;
    const methods = data?.contact_methods?.length ? data.contact_methods : (["email"] as ContactMethod[]);
    const preferred =
      data?.preferred_contact_method && methods.includes(data.preferred_contact_method)
        ? data.preferred_contact_method
        : (methods[0] ?? "email");

    setContactPreferences({
      email: data?.email?.trim() || user.email || "",
      phone: data?.phone ?? "",
      contact_methods: methods,
      preferred_contact_method: preferred,
    });
    setContactInitialized(true);
  }, [contactInitialized, profile.data, profile.isSuccess, user.email]);

  const contactMutation = useMutation({
    mutationFn: () =>
      updateContactFn({
        data: {
          email: contactPreferences.email || null,
          phone: contactPreferences.phone || null,
          contact_methods: contactPreferences.contact_methods,
          preferred_contact_method: contactPreferences.preferred_contact_method,
        },
      }),
    onSuccess: () => {
      toast.success("העדפות ההתקשרות נשמרו.");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את העדפות ההתקשרות."),
  });

  const loginEmailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ email: loginEmail.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setLoginEmailRequestSent(true);
      toast.success("בקשת שינוי האימייל נשלחה. השלימו את האימות לפי ההודעות שיישלחו אליכם.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את אימייל ההתחברות."),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccountFn({ data: { confirmation: "מחיקת החשבון לצמיתות" } }),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן למחוק את החשבון."),
  });

  const needsEmail = contactPreferences.contact_methods.includes("email");
  const needsPhone =
    contactPreferences.contact_methods.includes("whatsapp") || contactPreferences.contact_methods.includes("phone");
  const canSaveContactPreferences =
    !!profile.data &&
    contactPreferences.contact_methods.length > 0 &&
    contactPreferences.contact_methods.includes(contactPreferences.preferred_contact_method) &&
    (!needsEmail || contactPreferences.email.trim().length > 0) &&
    (!needsPhone || contactPreferences.phone.trim().length > 0);
  const normalizedLoginEmail = loginEmail.trim().toLowerCase();
  const currentLoginEmail = (user.email ?? "").trim().toLowerCase();
  const canUpdateLoginEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLoginEmail) &&
    normalizedLoginEmail !== currentLoginEmail &&
    !loginEmailMutation.isPending;

  return (
    <>
      <AccountPageHeader
        eyebrow="העדפות חשבון"
        title="הגדרות"
        description="ניהול דרכי קבלת הפניות, פרטי ההתחברות, העדפות החשבון ומחיקת החשבון."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AccountSectionCard
          title="דרכי התקשרות"
          description="אימייל מופעל כברירת מחדל. ניתן להוסיף WhatsApp או שיחת טלפון ולבחור את הערוץ המועדף."
          className="lg:col-span-2"
        >
          {profile.isLoading || !contactInitialized ? (
            <p className="text-sm text-muted-foreground">טוען את העדפות ההתקשרות…</p>
          ) : profile.isError ? (
            <p className="text-sm text-destructive">לא הצלחנו לטעון את העדפות ההתקשרות.</p>
          ) : (
            <div className="space-y-5">
              {!profile.data && (
                <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-3 text-sm text-muted-foreground">
                  לאחר שמירת הפרופיל הראשונה, אימייל החשבון יוגדר אוטומטית כברירת המחדל לקבלת פניות. לאחר מכן ניתן לשנות
                  כאן את ההעדפות.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                {CONTACT_METHOD_OPTIONS.map((option) => {
                  const selected = contactPreferences.contact_methods.includes(option.id);
                  const preferred = contactPreferences.preferred_contact_method === option.id;
                  const Icon = option.icon;

                  return (
                    <div
                      key={option.id}
                      className={`rounded-2xl border p-3 transition-colors ${
                        selected
                          ? preferred
                            ? "border-brand bg-brand-soft/70 shadow-sm"
                            : "border-brand/50 bg-white"
                          : "border-border bg-white/70"
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!profile.data || contactMutation.isPending}
                        onClick={() =>
                          setContactPreferences((current) => {
                            const isSelected = current.contact_methods.includes(option.id);
                            const nextMethods = isSelected
                              ? current.contact_methods.filter((method) => method !== option.id)
                              : [...current.contact_methods, option.id].slice(0, 3);

                            // At least one channel must always remain active. Email is the initial default,
                            // but therapists can later make another active channel their preferred one.
                            if (nextMethods.length === 0) return current;

                            const nextPreferred = isSelected
                              ? current.preferred_contact_method === option.id
                                ? nextMethods[0]
                                : current.preferred_contact_method
                              : current.preferred_contact_method;

                            return {
                              ...current,
                              contact_methods: nextMethods,
                              preferred_contact_method: nextPreferred,
                            };
                          })
                        }
                        className="flex w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-foreground">{option.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                            selected ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {selected ? "✓ פעיל" : "כבוי"}
                        </span>
                      </button>

                      {selected && (
                        <button
                          type="button"
                          aria-pressed={preferred}
                          disabled={!profile.data || contactMutation.isPending}
                          onClick={() =>
                            setContactPreferences((current) => ({
                              ...current,
                              preferred_contact_method: option.id,
                            }))
                          }
                          className={`mt-3 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60 ${
                            preferred
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-border bg-background text-foreground hover:border-brand/60"
                          }`}
                        >
                          <span aria-hidden>{preferred ? "★" : "☆"}</span>
                          <span>{preferred ? "מועדפת" : "הגדרה כמועדפת"}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    אימייל לקבלת פניות{needsEmail ? " *" : ""}
                  </span>
                  <Input
                    dir="ltr"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={contactPreferences.email}
                    disabled={!profile.data || contactMutation.isPending}
                    onChange={(event) =>
                      setContactPreferences((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    maxLength={160}
                    className="bg-white text-left"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    זו ברירת המחדל בפרופיל חדש, וניתן לשנות אותה כאן בכל עת.
                  </p>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    טלפון לקבלת פניות{needsPhone ? " *" : ""}
                  </span>
                  <Input
                    dir="ltr"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="050-1234567"
                    value={contactPreferences.phone}
                    disabled={!profile.data || contactMutation.isPending}
                    onChange={(event) =>
                      setContactPreferences((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    maxLength={40}
                    className="bg-white text-left"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">נדרש רק כאשר WhatsApp או שיחת טלפון פעילים.</p>
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!canSaveContactPreferences || contactMutation.isPending}
                  onClick={() => contactMutation.mutate()}
                >
                  {contactMutation.isPending ? "שומר…" : "שמירת העדפות התקשרות"}
                </Button>
              </div>
            </div>
          )}
        </AccountSectionCard>

        <AccountSectionCard title="פרטי החשבון" description="הפרטים המשמשים להתחברות לטיפולינקס.">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">כתובת אימייל של החשבון</span>
              <Input
                value={loginEmail}
                onChange={(event) => {
                  setLoginEmail(event.target.value);
                  setLoginEmailRequestSent(false);
                }}
                type="email"
                autoComplete="email"
                dir="ltr"
                className="bg-white text-left"
                disabled={loginEmailMutation.isPending}
              />
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                כתובת זו משמשת להתחברות בלבד. שינויה אינו משנה את האימייל המקצועי לקבלת פניות.
              </p>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!canUpdateLoginEmail}
              onClick={() => loginEmailMutation.mutate()}
            >
              {loginEmailMutation.isPending ? "שולח בקשת אימות…" : "החלפת אימייל ההתחברות"}
            </Button>
            {loginEmailRequestSent && (
              <p className="rounded-xl border border-brand/20 bg-brand-soft/40 p-3 text-xs leading-5 text-muted-foreground">
                שינוי האימייל יושלם רק לאחר ביצוע האימות הנדרש. עד אז, המשיכו להשתמש בכתובת הקיימת להתחברות.
              </p>
            )}
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-foreground">אבטחת החשבון</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  שינוי סיסמה וניהול אמצעי אימות יתווספו כאן בהמשך.
                </p>
              </div>
            </div>
          </div>
        </AccountSectionCard>

        <AccountSectionCard title="התראות" description="העדפות לקבלת עדכונים על פעילות בפרופיל.">
          <div className="space-y-4">
            <PreviewSetting
              icon={Mail}
              title="פנייה חדשה"
              description="קבלת התראה כאשר נוצרת פנייה חדשה דרך טיפולינקס."
            />
            <PreviewSetting
              icon={Bell}
              title="עדכוני חשבון"
              description="עדכונים על אימות מסמכים, חיובים ושינויים חשובים."
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">המתגים מוצגים לצורך תכנון הממשק בלבד ואינם נשמרים עדיין.</p>
        </AccountSectionCard>

        <DeleteAccountPanel
          pending={deleteAccountMutation.isPending}
          onConfirm={() => deleteAccountMutation.mutate()}
        />
      </div>
    </>
  );
}

function PreviewSetting({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked disabled aria-label={title} />
    </div>
  );
}

function DeleteAccountPanel({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = "מחיקת החשבון לצמיתות";

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !pending) {
      setAcknowledged(false);
      setConfirmation("");
    }
  }

  return (
    <section className="rounded-2xl border border-destructive/25 bg-surface-elevated shadow-card lg:col-span-2">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-muted-foreground marker:content-none sm:px-5">
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span>אפשרויות מחיקת החשבון</span>
          </span>
          <span className="text-xs group-open:hidden">הצגה</span>
          <span className="hidden text-xs group-open:inline">הסתרה</span>
        </summary>

        <div className="border-t border-destructive/20 px-4 py-4 sm:px-5 sm:py-5">
          <h2 className="text-lg font-semibold text-destructive">מחיקת החשבון לצמיתות</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            המחיקה תסיר לצמיתות את חשבון ההתחברות, הפרופיל, המסמכים וכל המידע המקצועי שנשמר בו. לא ניתן לבטל את הפעולה
            או לשחזר את החשבון לאחר מכן.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
            כדי לכבד את בקשת אי־הפנייה ולמנוע יצירת פרופיל חדש בטעות, כתובות האימייל של החשבון והפרופיל יישמרו בלבד
            ברשימת אי־פנייה מוגנת. לא יישמרו בה שם, טלפון או תוכן הפרופיל.
          </p>
          <Button type="button" variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
            מחיקת החשבון
          </Button>
        </div>
      </details>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>אישור מחיקת החשבון</DialogTitle>
            <DialogDescription>
              זהו השלב האחרון. לאחר המחיקה לא תהיה אפשרות לשחזר את החשבון או את הפרופיל.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} />
              <span className="text-sm text-foreground">
                ברור לי שהמחיקה היא לצמיתות ולא ניתן לשחזר את החשבון או את הפרופיל.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">כדי לאשר, הקלידו: {phrase}</span>
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
                ביטול
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || !acknowledged || confirmation !== phrase}
                onClick={onConfirm}
              >
                {pending ? "החשבון נמחק…" : "כן, מחיקת החשבון לצמיתות"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
