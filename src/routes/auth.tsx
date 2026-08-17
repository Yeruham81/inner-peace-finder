import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureTherapistAccount } from "@/lib/therapist-accounts.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (input) => searchSchema.parse(input),
  head: () => ({
    meta: [
      { title: "כניסת מטפלים | Tipulinks" },
      { name: "description", content: "כניסה, הרשמה ושחזור סיסמה למטפלים בפלטפורמת Tipulinks." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string {
  if (!next) return "/account";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

function AuthPage() {
  const { mode, next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup" | "forgot">(mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const dest = safeNext(next);

  // If already signed in, ensure account row exists and redirect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        try {
          await ensureTherapistAccount();
        } catch {
          /* non-fatal */
        }
        navigate({ to: dest });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dest, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg({ kind: "err", text: hebrewAuthError(error.message) });
      setLoading(false);
      return;
    }
    try {
      await ensureTherapistAccount();
    } catch {
      /* non-fatal */
    }
    navigate({ to: dest });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: fullName },
      },
    });
    if (error) {
      setMsg({ kind: "err", text: hebrewAuthError(error.message) });
      setLoading(false);
      return;
    }
    if (data.session) {
      try {
        await ensureTherapistAccount();
      } catch {
        /* non-fatal */
      }
      navigate({ to: dest });
      return;
    }
    setMsg({ kind: "ok", text: "שלחנו קישור אימות למייל. אשרו את הכתובת כדי להיכנס." });
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setMsg({ kind: "err", text: hebrewAuthError(error.message) });
    } else {
      setMsg({ kind: "ok", text: "שלחנו קישור לאיפוס סיסמה למייל." });
    }
    setLoading(false);
  }

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(true);
    setMsg(null);
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    });
    if (res.error) {
      setMsg({
        kind: "err",
        text: `כניסה דרך ${provider === "google" ? "Google" : "Apple"} נכשלה.`,
      });
      setLoading(false);
      return;
    }
    if (res.redirected) return;
    // Popup flow: session set, ensure account and redirect.
    try {
      await ensureTherapistAccount();
    } catch {
      /* non-fatal */
    }
    navigate({ to: dest });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {tab === "forgot" ? "שחזור סיסמה" : "כניסת מטפלים"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            הצטרפו לפלטפורמה, נהלו את הפרופיל שלכם וקבלו פניות ממטופלים.
          </p>
        </div>

        {tab !== "forgot" && (
          <div className="mb-4 flex gap-2 rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setMsg(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              כניסה
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setMsg(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              הרשמה
            </button>
          </div>
        )}

        {tab !== "forgot" && (
          <div className="mb-4 grid gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("google")}
              disabled={loading}
            >
              המשך עם Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("apple")}
              disabled={loading}
            >
              המשך עם Apple
            </Button>
            <div className="relative py-2 text-center text-xs text-muted-foreground">
              <span className="bg-surface-elevated px-2 relative z-10">או עם אימייל</span>
              <span className="absolute left-0 right-0 top-1/2 -z-0 border-t border-border" />
            </div>
          </div>
        )}

        {tab === "signin" && (
          <form onSubmit={handleSignIn} className="grid gap-3">
            <div>
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "טוען…" : "כניסה"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => {
                setTab("forgot");
                setMsg(null);
              }}
            >
              שכחתי סיסמה
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form onSubmit={handleSignUp} className="grid gap-3">
            <div>
              <Label htmlFor="full_name">שם מלא</Label>
              <Input
                id="full_name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
              <p className="mt-1 text-xs text-muted-foreground">לפחות 8 תווים.</p>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "טוען…" : "יצירת חשבון"}
            </Button>
          </form>
        )}

        {tab === "forgot" && (
          <form onSubmit={handleForgot} className="grid gap-3">
            <div>
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "שולח…" : "שליחת קישור איפוס"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => {
                setTab("signin");
                setMsg(null);
              }}
            >
              חזרה לכניסה
            </button>
          </form>
        )}

        {msg && (
          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${msg.kind === "err" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}
          >
            {msg.text}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/">חזרה לעמוד הבית</Link>
        </p>
      </div>
    </div>
  );
}

function hebrewAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "אימייל או סיסמה שגויים.";
  if (m.includes("email not confirmed")) return "יש לאשר את כתובת המייל לפני הכניסה.";
  if (m.includes("already registered") || m.includes("user already"))
    return "קיים כבר חשבון עם המייל הזה. נסו להיכנס או להתחבר עם ספק ההזדהות שרשמתם.";
  if (m.includes("password")) return "סיסמה לא תקינה. יש להשתמש בלפחות 8 תווים.";
  return msg;
}
