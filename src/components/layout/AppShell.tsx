"use client";

import { Clapperboard, Download, Home, Palette, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { authEnabled, getSupabase } from "@/lib/client/supabase";
import { useConfig } from "@/lib/client/hooks";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/create", label: "Create Character", short: "Create", icon: Plus },
  { href: "/characters", label: "My Characters", short: "Library", icon: Users },
  { href: "/studio/animate", label: "Animation Studio", short: "Animate", icon: Clapperboard },
  { href: "/studio/customise", label: "Customisation", short: "Customise", icon: Palette },
  { href: "/studio/export", label: "Export Studio", short: "Export", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];
const PUBLIC = ["/login", "/signup", "/reset"];

function Mark() {
  // Two marks render (sidebar + mobile header); each needs its own gradient id.
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="1" stopColor="#3fa9ff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="9" r="5" fill={`url(#${id})`} />
      <path d="M7 28c0-6 4-11 9-11s9 5 9 11" fill="none" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const cfg = useConfig();
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(!authEnabled());
  const isPublic = PUBLIC.some((p) => path.startsWith(p));

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setChecked(true);
      if (!data.session && !isPublic) router.replace(`/login?next=${encodeURIComponent(path)}`);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, [isPublic, path, router]);

  if (isPublic) return <main className="min-h-dvh">{children}</main>;

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh md:pl-[232px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col gap-1 px-4 py-6 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <Mark />
          <span className="font-display text-lg font-bold tracking-tight">Persona3D</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${active(n.href) ? "bg-graphite text-paper" : "text-mist hover:text-paper"}`}
            >
              <n.icon className={`size-[18px] ${active(n.href) ? "text-violet" : ""}`} aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2 text-[13px] text-mist">
          {cfg?.publicDemo ? (
            <p className="rounded-xl bg-graphite p-3 leading-snug">
              <span className="block font-medium text-paper">Public demo</span>
              Shows a sample character. Photo upload needs a private deployment.
            </p>
          ) : cfg?.mode === "local" && (
            <p className="rounded-xl bg-graphite p-3 leading-snug">
              <span className="block font-medium text-paper">Local studio</span>
              Single user, data kept in <code className="text-paper">.data/</code> on this machine.
            </p>
          )}
          {email && (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{email}</span>
              <button className="hover:text-paper" onClick={() => getSupabase()?.auth.signOut().then(() => router.replace("/login"))}>
                Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <header className="site-header sticky top-0 z-30 flex h-14 items-center justify-between bg-void/85 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Mark />
          <span className="font-display font-bold">Persona3D</span>
        </Link>
        <Link href="/settings" aria-label="Settings" className="p-2 text-mist">
          <Settings className="size-5" />
        </Link>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">{checked ? children : null}</main>

      <nav aria-label="Main" className="site-tabbar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-charcoal/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => n.href !== "/settings" && n.href !== "/studio/export").map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active(n.href) ? "text-paper" : "text-mist"}`}>
            <n.icon className={`size-5 ${active(n.href) ? "text-violet" : ""}`} aria-hidden />
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
