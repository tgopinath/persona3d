// Private object storage. Everything is stored privately and only reachable
// through short-lived signed URLs.
//   - LocalStorage:    files under .data/storage, signed with HMAC, served by /api/files
//   - SupabaseStorage: a private Supabase Storage bucket, createSignedUrl

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, isSupabaseConfigured } from "../config";
import { serviceClient } from "../db/supabase";

export interface Storage {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  signedUrl(key: string, expiresInSec?: number, download?: string): Promise<string>;
}

const safeKey = (key: string) => {
  const k = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (k.split("/").some((p) => p === ".." || p === "")) throw new Error("Invalid storage key");
  return k;
};

export function signLocal(key: string, exp: number) {
  return crypto.createHmac("sha256", config.signingSecret).update(`${key}:${exp}`).digest("base64url");
}

export class LocalStorage implements Storage {
  root = path.join(config.dataDir, "storage");
  private abs(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async put(key: string, data: Buffer | Uint8Array, contentType: string) {
    const p = this.abs(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    fs.writeFileSync(`${p}.meta`, JSON.stringify({ contentType }));
    return safeKey(key);
  }
  async get(key: string) {
    return fs.readFileSync(this.abs(key));
  }
  contentType(key: string) {
    try {
      return JSON.parse(fs.readFileSync(`${this.abs(key)}.meta`, "utf8")).contentType as string;
    } catch {
      return "application/octet-stream";
    }
  }
  async remove(keys: string[]) {
    for (const k of keys) {
      fs.rmSync(this.abs(k), { force: true });
      fs.rmSync(`${this.abs(k)}.meta`, { force: true });
    }
  }
  async removePrefix(prefix: string) {
    fs.rmSync(this.abs(prefix), { recursive: true, force: true });
  }
  async signedUrl(key: string, expiresInSec = 3600, download?: string) {
    const k = safeKey(key);
    const exp = Math.floor(Date.now() / 1000) + expiresInSec;
    const q = new URLSearchParams({ exp: String(exp), sig: signLocal(k, exp) });
    if (download) q.set("download", download);
    return `/api/files/${k.split("/").map(encodeURIComponent).join("/")}?${q}`;
  }
}

export class SupabaseStorage implements Storage {
  private bucket = () => serviceClient().storage.from(config.storageBucket);
  async put(key: string, data: Buffer | Uint8Array, contentType: string) {
    const { error } = await this.bucket().upload(safeKey(key), data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return safeKey(key);
  }
  async get(key: string) {
    const { data, error } = await this.bucket().download(safeKey(key));
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(keys: string[]) {
    if (keys.length) await this.bucket().remove(keys.map(safeKey));
  }
  async removePrefix(prefix: string) {
    const b = this.bucket();
    const walk = async (dir: string): Promise<string[]> => {
      const { data } = await b.list(dir, { limit: 1000 });
      const out: string[] = [];
      for (const item of data ?? []) {
        const p = `${dir}/${item.name}`;
        if (item.id) out.push(p);
        else out.push(...(await walk(p)));
      }
      return out;
    };
    const keys = await walk(safeKey(prefix));
    for (let i = 0; i < keys.length; i += 100) await b.remove(keys.slice(i, i + 100));
  }
  async signedUrl(key: string, expiresInSec = 3600, download?: string) {
    const { data, error } = await this.bucket().createSignedUrl(safeKey(key), expiresInSec, download ? { download } : undefined);
    if (error || !data) throw new Error(`Could not sign URL: ${error?.message}`);
    return data.signedUrl;
  }
}

const g = globalThis as unknown as { __persona3dStorage?: Storage };
export function storage(): Storage {
  if (!g.__persona3dStorage) g.__persona3dStorage = isSupabaseConfigured() ? new SupabaseStorage() : new LocalStorage();
  return g.__persona3dStorage;
}
