import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { NativeLooks } from "@/components/layout/NativeLooks";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600", "700", "800"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Persona3D Studio",
  description: "Turn photographs into rigged, animated 3D characters.",
};

export const viewport: Viewport = { themeColor: "#05060a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-m3-primary="#6B4EFF" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Native looks only inside the phone apps (Material 3 on Android, Apple HIG on iPhone); inert in browsers. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://tgopinath.github.io/kolam-design-system/m3/kolam-m3.js" />
        <link rel="stylesheet" href="https://tgopinath.github.io/kolam-design-system/m3/kolam-m3.css" />
        <link rel="stylesheet" href="https://tgopinath.github.io/kolam-design-system/ios/kolam-ios.css" />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://tgopinath.github.io/kolam-design-system/ios/kolam-ios.js" />
      </head>
      <body>
        <Suspense>
          <NativeLooks />
        </Suspense>
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
