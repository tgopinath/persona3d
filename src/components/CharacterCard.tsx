"use client";

import { Clapperboard, Copy, Download, MoreHorizontal, Palette, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { STYLES } from "@/lib/styles";
import type { CharacterView } from "@/lib/types";
import { Button, Dialog, StatusBadge } from "./ui";

function Silhouette() {
  return (
    <svg viewBox="0 0 100 120" className="h-3/5 opacity-40" aria-hidden>
      <circle cx="50" cy="28" r="15" fill="#3a3d52" />
      <path d="M20 118c0-26 13-46 30-46s30 20 30 46z" fill="#3a3d52" />
    </svg>
  );
}

export function CharacterCard({ c, onDelete, onDuplicate }: { c: CharacterView; onDelete: (c: CharacterView) => Promise<void>; onDuplicate: (c: CharacterView) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<"delete" | "dup" | null>(null);
  const ready = c.generation_status === "completed" && !!c.model_url;
  const style = STYLES.find((s) => s.id === c.style);
  const href = ready ? `/characters/${c.id}` : `/create?c=${c.id}`;

  return (
    <article className="panel group relative flex flex-col overflow-hidden">
      <Link href={href} className="relative grid aspect-[4/5] place-items-center overflow-hidden" style={{ background: `radial-gradient(70% 50% at 50% 85%, ${style?.gradient[0]}55, transparent), #0b0c13` }}>
        {c.thumbnail_signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnail_signed_url} alt={`${c.name} thumbnail`} className="size-full object-cover" />
        ) : (
          <Silhouette />
        )}
        <span className="absolute left-3 top-3">
          <StatusBadge status={c.generation_status} />
        </span>
        {c.is_demo && <span className="absolute right-3 top-3 rounded-full bg-void/70 px-2 py-0.5 text-[11px] text-mist">Demo</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold">{c.name}</h3>
          <div className="relative">
            <button aria-label={`More actions for ${c.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} className="-mr-1 rounded-lg p-1 text-mist hover:bg-graphite hover:text-paper">
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 z-10 w-44 rounded-xl bg-graphite p-1 shadow-2xl" onMouseLeave={() => setMenu(false)}>
                <button
                  disabled={!ready || !!busy}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line disabled:opacity-40"
                  onClick={async () => {
                    setBusy("dup");
                    await onDuplicate(c).finally(() => setBusy(null));
                    setMenu(false);
                  }}
                >
                  <Copy className="size-4" /> {busy === "dup" ? "Duplicating…" : "Duplicate"}
                </button>
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-line" onClick={() => (setConfirm(true), setMenu(false))}>
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-[13px] text-mist">
          {style?.name ?? c.style}, {new Date(c.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <p className="text-[13px] text-mist">{c.animation_count ? `${c.animation_count} animations` : c.rig_status === "unsupported" ? "Not rigged" : "No animations yet"}</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { href: `/studio/customise?c=${c.id}`, label: "Edit", icon: Palette },
            { href: `/studio/animate?c=${c.id}`, label: "Animate", icon: Clapperboard },
            { href: `/studio/export?c=${c.id}`, label: "Export", icon: Download },
          ].map((a) =>
            ready ? (
              <Link key={a.label} href={a.href} className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-graphite text-[13px] hover:bg-line">
                <a.icon className="size-3.5" /> {a.label}
              </Link>
            ) : (
              <span key={a.label} aria-disabled className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-graphite/50 text-[13px] text-mist/50">
                <a.icon className="size-3.5" /> {a.label}
              </span>
            )
          )}
        </div>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${c.name}?`}>
        <p className="text-sm text-mist">This permanently removes the character, its source photos, animations and exports. It can&apos;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={busy === "delete"}
            onClick={async () => {
              setBusy("delete");
              await onDelete(c).finally(() => setBusy(null));
              setConfirm(false);
            }}
          >
            Delete permanently
          </Button>
        </div>
      </Dialog>
    </article>
  );
}
