"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AnimationRecord, CharacterPhotoRecord, CharacterView, GenerationJobRecord, ProviderInfo } from "../types";

export interface AppConfig {
  mode: "local" | "supabase";
  providers: ProviderInfo[];
  defaultProvider: string;
  maxUploadMb: number;
  demoStageDelayMs: number;
  retentionDays: number;
  publicDemo?: boolean;
}

let configCache: Promise<AppConfig> | null = null;
export function useConfig() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    configCache ??= api<AppConfig>("/api/config");
    configCache.then(setCfg).catch(() => (configCache = null));
  }, []);
  return cfg;
}

/**
 * Runs `fn` whenever `key` changes (or on reload). Loading is derived from
 * whether the latest result belongs to the current key, so no state is set
 * synchronously inside effects.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const [nonce, setNonce] = useState(0);
  const want = `${key}#${nonce}`;
  const [res, setRes] = useState<{ for: string; data: T | null; error: string | null }>({ for: "", data: null, error: null });
  useEffect(() => {
    let alive = true;
    fnRef.current().then(
      (data) => alive && setRes({ for: want, data, error: null }),
      (e) => alive && setRes((r) => ({ for: want, data: r.data, error: (e as Error).message }))
    );
    return () => {
      alive = false;
    };
  }, [want]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((v: T | null | ((d: T | null) => T | null)) => setRes((r) => ({ ...r, data: typeof v === "function" ? (v as (d: T | null) => T | null)(r.data) : v })), []);
  return { data: res.data, error: res.for === want ? res.error : null, loading: res.for !== want, reload, setData };
}

export type PhotoWithUrl = CharacterPhotoRecord & { signed_url: string };
export type AnimationWithUrl = AnimationRecord & { signed_url: string | null };

export function useCharacter(id: string | null) {
  return useAsync(async () => (id ? api<{ character: CharacterView; photos: PhotoWithUrl[] }>(`/api/characters/${id}`) : null), `character:${id}`);
}

export function useCharacters() {
  return useAsync(() => api<{ characters: CharacterView[] }>("/api/characters").then((r) => r.characters), "characters");
}

export function useAnimations(id: string | null) {
  return useAsync(async () => (id ? (await api<{ animations: AnimationWithUrl[] }>(`/api/characters/${id}/animations`)).animations : []), `animations:${id}`);
}

/** Polls a job until it reaches a terminal state. */
/** `restart` re-arms polling after a retry. */
export function useJob(jobId: string | null, onDone?: (job: GenerationJobRecord) => void, restart = 0) {
  const [job, setJob] = useState<GenerationJobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const { job } = await api<{ job: GenerationJobRecord }>(`/api/jobs/${jobId}`);
        if (stop) return;
        setJob(job);
        setError(null);
        if (["completed", "failed", "cancelled"].includes(job.job_status)) {
          done.current?.(job);
          return;
        }
      } catch (e) {
        setError((e as Error).message);
      }
      timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, restart]);
  return { job, setJob, error };
}
