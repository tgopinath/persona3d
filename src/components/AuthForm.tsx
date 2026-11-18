"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authEnabled, getSupabase, googleEnabled } from "@/lib/client/supabase";
import { Button, Field, inputCls } from "./ui";

type Mode = "login" | "signup" | "reset";
const COPY: Record<Mode, { title: string; cta: string }> = {
  login: { title: "Log in to Persona3D", cta: "Log in" },
  signup: { title: "Create your account", cta: "Create account" },
  reset: { title: "Reset your password", cta: "Send reset link" },
};

function Form({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  // Arrived from a password-reset email: Supabase has set a recovery session.
  const updating = mode === "reset" && params.get("update") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const sb = getSupabase();

  if (!authEnabled() || !sb)
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Accounts aren&apos;t set up</h1>
        <p className="text-mist">This studio runs in local mode with a single user, so there&apos;s nothing to log in to. Add Supabase keys to enable accounts.</p>
        <Link href="/" className="text-volt hover:underline">
          Go to the studio
        </Link>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: `${location.origin}/` } });
        if (error) throw error;
        if (data.session) router.replace("/");
        else setInfo("Check your inbox to confirm your email, then log in.");
      } else if (updating) {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset?update=1` });
        if (error) throw error;
        setInfo("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-3xl font-bold">{COPY[mode].title}</h1>
      {mode === "signup" && (
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
        </Field>
      )}
      {!updating && <Field label="Email">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
      </Field>}
      {(mode !== "reset" || updating) && (
        <Field label={updating ? "New password" : "Password"} hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {info && <p className="text-sm text-ok">{info}</p>}
      <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
        {updating ? "Save new password" : COPY[mode].cta}
      </Button>
      {googleEnabled() && mode !== "reset" && (
        <Button type="button" size="lg" className="w-full" onClick={() => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}${next}` } })}>
          Continue with Google
        </Button>
      )}
      <div className="flex justify-between text-sm text-mist">
        {mode === "login" ? (
          <>
            <Link href="/signup" className="hover:text-paper">
              Create an account
            </Link>
            <Link href="/reset" className="hover:text-paper">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link href="/login" className="hover:text-paper">
            Back to log in
          </Link>
        )}
      </div>
    </form>
  );
}

export function AuthPage({ mode }: { mode: Mode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Suspense>
            <Form mode={mode} />
          </Suspense>
        </div>
      </div>
      <div className="stage m-4 hidden rounded-[28px] lg:block" aria-hidden />
    </div>
  );
}
