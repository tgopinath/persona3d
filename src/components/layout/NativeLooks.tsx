"use client";

/**
 * Native looks inside the phone apps, from the shared Kolam kits (loaded in app/layout.tsx):
 * - Android app (Capacitor shell, or ?app=android): Material Design 3 top app bar + navigation bar (KolamM3).
 * - iPhone app (Persona3D-iOS shell, or ?app=ios): Apple HIG navigation bar + tab bar (KolamIOS).
 * In a normal browser both kits stay off and the website keeps its own look.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Kit = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    KolamM3?: Kit;
    KolamIOS?: Kit;
  }
}

const TABS = [
  { id: "home", href: "/", label: "Home", m3: "home", ios: "house" },
  { id: "create", href: "/create", label: "Create", m3: "add_circle", ios: "plus" },
  { id: "library", href: "/characters", label: "Library", m3: "groups", ios: "person.2" },
  { id: "animate", href: "/studio/animate", label: "Animate", m3: "movie", ios: "play.fill" },
  { id: "customise", href: "/studio/customise", label: "Customise", m3: "palette", ios: "sparkles" },
];
const TITLES: [string, string][] = [
  ["/create", "Create Character"],
  ["/characters", "My Characters"],
  ["/studio/animate", "Animation Studio"],
  ["/studio/customise", "Customisation"],
  ["/studio/export", "Export Studio"],
  ["/settings", "Settings"],
];

const tabOf = (path: string) => (path === "/" ? "home" : TABS.find((t) => t.href !== "/" && path.startsWith(t.href))?.id);
const titleOf = (path: string) => (path === "/" ? "Persona3D" : TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "Persona3D");

export function NativeLooks() {
  const router = useRouter();
  const path = usePathname();
  const mode = useRef<"android" | "ios" | null>(null);
  const m3 = useRef<Kit | null>(null);

  useEffect(() => {
    const go = (href: string) => router.push(href);
    const settings = () => router.push("/settings");
    const ios = window.KolamIOS?.init({
      appName: "Persona3D",
      uaTokens: ["Persona3D-iOS"],
      tint: { light: "#6B4EFF", dark: "#A898FF" },
      tabs: TABS.map((t) => ({ id: t.id, label: t.label, icon: t.ios, href: t.href })),
      currentTab: tabOf(location.pathname) ?? "home",
      onTabSelect: (id: string) => {
        const t = TABS.find((x) => x.id === id);
        if (t) go(t.href);
        return false;
      },
    });
    if (ios) {
      mode.current = "ios";
      document.documentElement.classList.remove("k-android", "k-app");
    } else if (window.KolamM3?.isAndroid) {
      mode.current = "android";
      m3.current = window.KolamM3.init({
        primary: "#6B4EFF",
        title: "Persona3D",
        home: "/",
        destinations: TABS.map((t) => ({ id: t.id, label: t.label, icon: t.m3, onSelect: (_d: unknown, e: Event) => { e?.preventDefault?.(); go(t.href); } })),
        actions: [{ icon: "settings", label: "Settings", onClick: settings }],
        back: "history",
        isRoot: () => !!tabOf(location.pathname),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tab = tabOf(path);
    const title = titleOf(path);
    if (mode.current === "ios") {
      const K = window.KolamIOS!;
      if (tab) K.tabBar.select(tab);
      const actions = [{ icon: "gearshape", label: "Settings", onClick: () => router.push("/settings") }];
      if (tab) K.navBar.set({ title, large: tab === "home", actions });
      else K.navBar.set({ title, back: { label: "Back", onClick: () => (history.length > 1 ? history.back() : router.push("/")) }, actions: [] });
    } else if (m3.current) {
      const kit = m3.current;
      setTimeout(() => {
        kit.setTitle(title);
        if (tab) kit.setActive(tab);
        kit.setBack(tab ? false : "/");
      });
    }
  }, [path, router]);

  return null;
}
