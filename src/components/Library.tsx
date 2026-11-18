"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { useCharacters } from "@/lib/client/hooks";
import { STYLES } from "@/lib/styles";
import type { CharacterView } from "@/lib/types";
import { CharacterCard } from "./CharacterCard";
import { EmptyState, ErrorNote, LinkButton, Spinner, inputCls } from "./ui";

export function Library({ limit, controls = true }: { limit?: number; controls?: boolean }) {
  const { data, error, loading, reload, setData } = useCharacters();
  const [q, setQ] = useState("");
  const [style, setStyle] = useState("all");
  const [range, setRange] = useState("any");
  const [sort, setSort] = useState("newest");
  const [actionError, setActionError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const list = useMemo(() => {
    let l = data ?? [];
    if (q) l = l.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
    if (style !== "all") l = l.filter((c) => c.style === style);
    if (range !== "any") {
      const days = Number(range);
      l = l.filter((c) => now - new Date(c.created_at).getTime() < days * 86_400_000);
    }
    l = [...l].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
    return limit ? l.slice(0, limit) : l;
  }, [data, q, style, range, sort, limit, now]);

  const onDelete = async (c: CharacterView) => {
    try {
      await api(`/api/characters/${c.id}`, { method: "DELETE" });
      setData((d) => d?.filter((x) => x.id !== c.id) ?? null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const onDuplicate = async (c: CharacterView) => {
    try {
      const { character } = await api<{ character: CharacterView }>(`/api/characters/${c.id}/duplicate`, { method: "POST" });
      setData((d) => [character, ...(d ?? [])]);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const sel = "h-10 rounded-full bg-charcoal px-3 text-sm text-paper outline-none ring-1 ring-line focus:ring-volt";

  return (
    <div className="space-y-5">
      {controls && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search characters</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mist" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={`${inputCls} rounded-full pl-10`} />
          </label>
          <select aria-label="Filter by style" value={style} onChange={(e) => setStyle(e.target.value)} className={sel}>
            <option value="all">All styles</option>
            {STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select aria-label="Filter by creation date" value={range} onChange={(e) => setRange(e.target.value)} className={sel}>
            <option value="any">Any date</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={sel}>
            <option value="newest">Recently created</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      )}
      {actionError && <ErrorNote>{actionError}</ErrorNote>}
      {loading && !data ? (
        <Spinner label="Loading your characters" />
      ) : error ? (
        <ErrorNote onRetry={reload}>{error}</ErrorNote>
      ) : !data?.length ? (
        <EmptyState title="No characters yet" body="Upload a few photos of yourself from different angles and we'll build a 3D character you can animate and export." action={<LinkButton href="/create" variant="primary">Create your first character</LinkButton>} />
      ) : !list.length ? (
        <p className="text-mist">No characters match these filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4">
          {list.map((c) => (
            <CharacterCard key={c.id} c={c} onDelete={onDelete} onDuplicate={onDuplicate} />
          ))}
        </div>
      )}
    </div>
  );
}
