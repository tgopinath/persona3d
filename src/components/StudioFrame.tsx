"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { useAnimations, useCharacter, useCharacters, type AnimationWithUrl, type PhotoWithUrl } from "@/lib/client/hooks";
import { renderThumbnail } from "@/lib/client/exporters";
import type { LoadedModel } from "@/lib/client/modelRuntime";
import type { CharacterView } from "@/lib/types";
import { EmptyState, ErrorNote, LinkButton, Pill, Spinner } from "./ui";

/** Characters whose thumbnail was already rendered this session. */
const thumbnailed = new Set<string>();

/** Lets the user pick which character a studio page works on. */
export function CharacterPicker({ title, path }: { title: string; path: string }) {
  const { data, loading, error } = useCharacters();
  const ready = (data ?? []).filter((c) => c.generation_status === "completed" && c.model_url);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : !ready.length ? (
        <EmptyState title="No finished characters yet" body="Generate a character first, then come back here to work on it." action={<LinkButton href="/create" variant="primary">Create a character</LinkButton>} />
      ) : (
        <>
          <p className="text-mist">Choose a character to open.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ready.map((c) => (
              <Link key={c.id} href={`${path}?c=${c.id}`} className="panel overflow-hidden hover:ring-1 hover:ring-line">
                <div className="aspect-square bg-void/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumbnail_signed_url && <img src={c.thumbnail_signed_url} alt="" className="size-full object-cover" />}
                </div>
                <p className="truncate p-3 text-sm font-medium">{c.name}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface StudioData {
  character: CharacterView;
  photos: PhotoWithUrl[];
  animations: AnimationWithUrl[];
  providerAnimations: { name: string; url: string }[];
  setCharacter: (c: CharacterView) => void;
  /** Call from CharacterStage onLoaded: uploads a thumbnail the first time. */
  onModelLoaded: (m: LoadedModel) => void;
}

function Inner({ id, title, path, children }: { id: string | null; title: string; path: string; children: (d: StudioData) => ReactNode }) {
  const { data, error, loading, setData } = useCharacter(id);
  const anims = useAnimations(id);
  const character = data?.character;

  const onModelLoaded = useCallback(() => {
    if (!character || character.thumbnail_url || thumbnailed.has(character.id)) return;
    thumbnailed.add(character.id);
    // Give the camera a moment to settle on the full-body framing.
    setTimeout(async () => {
      try {
        const png = await renderThumbnail();
        await api(`/api/characters/${character.id}/thumbnail`, { method: "POST", body: png, headers: { "Content-Type": "image/png" } });
      } catch {
        /* thumbnails are best-effort */
      }
    }, 1200);
  }, [character]);

  if (!id) return <CharacterPicker title={title} path={path} />;
  if (loading && !data) return <Spinner label="Loading character" />;
  if (error || !data || !character) return <ErrorNote>{error ?? "Character not found"}</ErrorNote>;
  if (character.generation_status !== "completed" || !character.model_signed_url)
    return (
      <EmptyState
        title={`${character.name} isn't ready yet`}
        body={character.generation_status === "failed" ? "Generation failed. Open it to retry the failed stage." : "This character is still being generated."}
        action={<LinkButton href={`/create?c=${character.id}`} variant="primary">Open generation</LinkButton>}
      />
    );
  const providerAnimations = (anims.data ?? []).filter((a) => a.source === "provider" && a.signed_url).map((a) => ({ name: a.animation_name, url: a.signed_url! }));
  return (
    <>
      {children({
        character,
        photos: data.photos,
        animations: anims.data ?? [],
        providerAnimations,
        setCharacter: (c) => setData((d) => (d ? { ...d, character: c } : d)),
        onModelLoaded,
      })}
    </>
  );
}

function WithParams(props: { title: string; path: string; children: (d: StudioData) => ReactNode }) {
  const id = useSearchParams().get("c");
  return <Inner id={id} {...props} />;
}

/** Wrapper for studio pages that operate on `?c=<characterId>`. */
export function Studio(props: { title: string; path: string; children: (d: StudioData) => ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <WithParams {...props} />
    </Suspense>
  );
}

export function StudioHeader({ character, title, children }: { character: CharacterView; title: string; children?: ReactNode }) {
  const router = useRouter();
  useEffect(() => router.prefetch(`/characters/${character.id}`), [router, character.id]);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-mist">
          <Link href={`/characters/${character.id}`} className="hover:text-paper">
            {character.name}
          </Link>
        </p>
        <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold md:text-4xl">
          {title}
          {character.is_demo && <Pill tone="warn">Demo character</Pill>}
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
