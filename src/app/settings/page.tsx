"use client";

import { useState } from "react";
import { Button, Dialog, ErrorNote, Pill, Spinner, Toggle, inputCls } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useAsync, useConfig } from "@/lib/client/hooks";
import { getSupabase } from "@/lib/client/supabase";
import type { UserRecord } from "@/lib/types";

export default function SettingsPage() {
  const cfg = useConfig();
  const { data: user, setData, error, loading } = useAsync(() => api<{ user: UserRecord }>("/api/account").then((r) => r.user), "account");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"photos" | "account" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = async (p: Partial<UserRecord>) => {
    setErr(null);
    try {
      const r = await api<{ user: UserRecord; purged: number }>("/api/account", { method: "PATCH", json: p });
      setData(r.user);
      setMsg(r.purged ? `Saved. ${r.purged} photo${r.purged > 1 ? "s" : ""} older than the new retention period were deleted.` : "Saved");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading) return <Spinner />;
  if (error || !user) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold md:text-4xl">Settings</h1>
      {msg && <p className="text-sm text-ok">{msg}</p>}
      {err && <ErrorNote>{err}</ErrorNote>}

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">Account</h2>
        <label className="block text-sm">
          Display name
          <input defaultValue={user.name} onBlur={(e) => e.target.value !== user.name && patch({ name: e.target.value })} className={`${inputCls} mt-1.5`} />
        </label>
        <p className="text-sm text-mist">{cfg?.mode === "local" ? "Local studio mode: there's one user on this machine and no sign-in. Configure Supabase to enable accounts." : user.email}</p>
        {cfg?.mode === "supabase" && (
          <Button variant="ghost" onClick={() => getSupabase()?.auth.signOut().then(() => (location.href = "/login"))}>
            Log out
          </Button>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 text-lg font-semibold">Generation services</h2>
        <ul className="space-y-3">
          {cfg?.providers.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-[13px] text-mist">{p.notes}</p>
              </div>
              {p.demo ? <Pill tone="warn">Always on</Pill> : p.configured ? <Pill tone="volt">Connected</Pill> : <Pill>Not configured</Pill>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-mist">API keys live only in the server environment (see README). They are never sent to the browser.</p>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <Toggle
          label="Allow my photos to be used to improve models"
          hint="Off by default. While off, your photos are only used to generate your own characters and are never shared for training."
          checked={user.allow_training}
          onChange={(v) => patch({ allow_training: v })}
        />
        <label className="flex items-center justify-between gap-4 py-2 text-sm">
          <span>
            Keep source photos for
            <span className="block text-[13px] text-mist">Photos of finished characters are deleted after this period. Characters stay.</span>
          </span>
          <select value={user.retention_days} onChange={(e) => patch({ retention_days: Number(e.target.value) })} className="h-10 rounded-full bg-void/60 px-3 ring-1 ring-line">
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d === 365 ? "1 year" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[13px] text-mist">Characters are private. Files are only reachable through links that expire after an hour.</p>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">Delete data</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Delete all uploaded photos
            <span className="block text-[13px] text-mist">Your generated characters are kept.</span>
          </p>
          <Button variant="danger" onClick={() => setDialog("photos")}>
            Delete photos
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Delete account and all data
            <span className="block text-[13px] text-mist">Characters, photos, animations, exports and the account itself.</span>
          </p>
          <Button variant="danger" onClick={() => (setConfirm(""), setDialog("account"))}>
            Delete everything
          </Button>
        </div>
      </section>

      <Dialog open={dialog === "photos"} onClose={() => setDialog(null)} title="Delete all photos?">
        <p className="text-sm text-mist">Every source photo is permanently deleted. You won&apos;t be able to regenerate existing characters from them.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await api<{ deleted: number }>("/api/account/photos", { method: "DELETE" }).catch((e) => (setErr(e.message), null));
              setBusy(false);
              setDialog(null);
              if (r) setMsg(`Deleted ${r.deleted} photo${r.deleted === 1 ? "" : "s"}`);
            }}
          >
            Delete photos
          </Button>
        </div>
      </Dialog>

      <Dialog open={dialog === "account"} onClose={() => setDialog(null)} title="Delete your account?">
        <p className="text-sm text-mist">This permanently deletes everything and can&apos;t be undone. Type DELETE to confirm.</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputCls} mt-3`} aria-label="Type DELETE to confirm" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={confirm !== "DELETE"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/account", { method: "DELETE", json: { confirm } });
                await getSupabase()?.auth.signOut();
                location.href = cfg?.mode === "supabase" ? "/signup" : "/";
              } catch (e) {
                setErr((e as Error).message);
                setBusy(false);
                setDialog(null);
              }
            }}
          >
            Delete everything
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
