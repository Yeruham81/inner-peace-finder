import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "איפוס סיסמה | Tipulinks" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  useEffect(() => {
    // Supabase auto-parses the recovery token from the URL hash and emits a
    // PASSWORD_RECOVERY event. Show the form as soon as a session is present.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) { setMsg({ kind: "err", text: "סיסמה חייבת להיות באורך 8 תווים לפחות." }); return; }
    if (password !== confirm) { setMsg({ kind: "err", text: "הסיסמאות לא תואמות." }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    setMsg({ kind: "ok", text: "הסיסמה עודכנה. מעביר לחשבון…" });
    setTimeout(() => navigate({ to: "/account" }), 900);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
        <h1 className="text-xl font-bold text-foreground">איפוס סיסמה</h1>
        {!ready && (
          <p className="mt-4 text-sm text-muted-foreground">
            הקישור לא תקין או פג תוקף. חזרו לעמוד <Link to="/auth" className="underline">הכניסה</Link> ובקשו קישור חדש.
          </p>
        )}
        {ready && (
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <div>
              <Label htmlFor="pw">סיסמה חדשה</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label htmlFor="pw2">אישור סיסמה</Label>
              <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
            </div>
            <Button type="submit" disabled={loading}>{loading ? "מעדכן…" : "עדכון סיסמה"}</Button>
          </form>
        )}
        {msg && (
          <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${msg.kind === "err" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}