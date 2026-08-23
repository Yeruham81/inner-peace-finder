import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountSectionCard } from "@/components/account/account-section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getMyProfile,
  updateMyContactPreferences,
  type ContactMethod,
} from "@/lib/therapist-profile.functions";

const CONTACT_METHOD_OPTIONS: readonly {
  id: ContactMethod;
  label: string;
  description: string;
  icon: typeof Mail;
}[] = [
  { id: "email", label: "אימייל", description: "פניות כתובות", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", description: "הודעות ישירות", icon: MessageCircle },
  { id: "phone", label: "טלפון", description: "שיחות טלפון", icon: Phone },
];

type ContactPreferencesState = {
  email: string;
  phone: string;
  contact_methods: ContactMethod[];
  preferred_contact_method: ContactMethod;
};

export function ContactPreferencesPanel({ defaultEmail }: { defaultEmail: string }) {
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const updateContactFn = useServerFn(updateMyContactPreferences);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn() });
  const [preferences, setPreferences] = useState<ContactPreferencesState>({
    email: defaultEmail,
    phone: "",
    contact_methods: ["email"],
    preferred_contact_method: "email",
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !profile.isSuccess) return;
    const data = profile.data;
    const methods = data?.contact_methods?.length
      ? data.contact_methods
      : (["email"] as ContactMethod[]);
    const preferred =
      data?.preferred_contact_method && methods.includes(data.preferred_contact_method)
        ? data.preferred_contact_method
        : (methods[0] ?? "email");

    setPreferences({
      email: data?.email?.trim() || defaultEmail,
      phone: data?.phone ?? "",
      contact_methods: methods,
      preferred_contact_method: preferred,
    });
    setInitialized(true);
  }, [defaultEmail, initialized, profile.data, profile.isSuccess]);

  const mutation = useMutation({
    mutationFn: () =>
      updateContactFn({
        data: {
          email: preferences.email || null,
          phone: preferences.phone || null,
          contact_methods: preferences.contact_methods,
          preferred_contact_method: preferences.preferred_contact_method,
        },
      }),
    onSuccess: () => {
      toast.success("דרכי ההתקשרות נשמרו.");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את דרכי ההתקשרות."),
  });

  const needsEmail = preferences.contact_methods.includes("email");
  const needsPhone = preferences.contact_methods.some(
    (method) => method === "whatsapp" || method === "phone",
  );
  const canSave =
    !!profile.data &&
    preferences.contact_methods.length > 0 &&
    preferences.contact_methods.includes(preferences.preferred_contact_method) &&
    (!needsEmail || preferences.email.trim().length > 0) &&
    (!needsPhone || preferences.phone.trim().length > 0);

  function toggleMethod(method: ContactMethod) {
    setPreferences((current) => {
      const selected = current.contact_methods.includes(method);
      const nextMethods = selected
        ? current.contact_methods.filter((item) => item !== method)
        : [...current.contact_methods, method];
      if (nextMethods.length === 0) return current;
      return {
        ...current,
        contact_methods: nextMethods,
        preferred_contact_method:
          selected && current.preferred_contact_method === method
            ? (nextMethods[0] ?? "email")
            : current.preferred_contact_method,
      };
    });
  }

  return (
    <AccountSectionCard
      title="דרכי קבלת פניות"
      description="בחרו באילו ערוצים לקבל פניות ומהו הערוץ המועדף. לפחות ערוץ אחד חייב להישאר פעיל."
    >
      {profile.isLoading || !initialized ? (
        <p className="text-sm text-muted-foreground">טוען את דרכי ההתקשרות…</p>
      ) : profile.isError ? (
        <p className="text-sm text-destructive">לא הצלחנו לטעון את דרכי ההתקשרות.</p>
      ) : !profile.data ? (
        <p className="rounded-xl border border-brand/20 bg-brand-soft/40 p-3 text-sm text-muted-foreground">
          ניתן להגדיר דרכי התקשרות לאחר שמירת הפרופיל הראשונה.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {CONTACT_METHOD_OPTIONS.map((option) => {
              const selected = preferences.contact_methods.includes(option.id);
              const preferred = preferences.preferred_contact_method === option.id;
              const Icon = option.icon;
              return (
                <div
                  key={option.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${
                    selected ? "border-brand/50 bg-brand-soft/45" : "border-border bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={mutation.isPending}
                    onClick={() => toggleMethod(option.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-elevated text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {selected ? "פעיל" : option.description}
                      </span>
                    </span>
                  </button>
                  {selected && (
                    <button
                      type="button"
                      aria-pressed={preferred}
                      disabled={mutation.isPending}
                      onClick={() =>
                        setPreferences((current) => ({
                          ...current,
                          preferred_contact_method: option.id,
                        }))
                      }
                      className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
                        preferred
                          ? "bg-brand text-brand-foreground"
                          : "bg-surface-elevated text-muted-foreground"
                      }`}
                    >
                      {preferred ? "★ מועדף" : "העדפה"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label>
              <span className="mb-1 block text-xs font-medium text-foreground">
                אימייל{needsEmail ? " *" : ""}
              </span>
              <Input
                dir="ltr"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={preferences.email}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, email: event.target.value }))
                }
                maxLength={160}
                className="bg-white text-left"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-foreground">
                טלפון{needsPhone ? " *" : ""}
              </span>
              <Input
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-1234567"
                value={preferences.phone}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, phone: event.target.value }))
                }
                maxLength={40}
                className="bg-white text-left"
              />
            </label>
            <Button
              type="button"
              disabled={!canSave || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      )}
    </AccountSectionCard>
  );
}
