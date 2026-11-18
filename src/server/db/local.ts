import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { Db, TableName, Tables } from "./index";

type Store = { [K in TableName]: Tables[K][] };
const EMPTY: Store = { users: [], characters: [], character_photos: [], animations: [], generation_jobs: [], exports: [] };

const matches = <T>(row: T, where: Partial<T>) =>
  Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);

/**
 * File-backed store for local development. Reads the file on every call so a
 * separate worker process and the Next.js server see each other's writes;
 * writes are atomic (tmp file + rename).
 */
export class LocalJsonDb implements Db {
  private file = path.join(config.dataDir, "db.json");
  private queue: Promise<unknown> = Promise.resolve();

  private read(): Store {
    try {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
    } catch {
      return structuredClone(EMPTY);
    }
  }
  private write(s: Store) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
    fs.renameSync(tmp, this.file);
  }
  private mutate<R>(fn: (s: Store) => R): Promise<R> {
    const run = this.queue.then(() => {
      const s = this.read();
      const r = fn(s);
      this.write(s);
      return r;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  insert<T extends TableName>(table: T, row: Tables[T]) {
    return this.mutate((s) => {
      (s[table] as Tables[T][]).push(row);
      return row;
    });
  }
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    return this.mutate((s) => {
      const rows = s[table] as Tables[T][];
      const i = rows.findIndex((r) => (r as { id: string }).id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch };
      return rows[i];
    });
  }
  async get<T extends TableName>(table: T, id: string) {
    return ((this.read()[table] as Tables[T][]).find((r) => (r as { id: string }).id === id) ?? null) as Tables[T] | null;
  }
  async find<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    return (this.read()[table] as Tables[T][]).filter((r) => matches(r, where));
  }
  async findIn<T extends TableName>(table: T, field: keyof Tables[T], values: unknown[]) {
    const set = new Set(values);
    return (this.read()[table] as Tables[T][]).filter((r) => set.has(r[field]));
  }
  remove<T extends TableName>(table: T, id: string) {
    return this.mutate((s) => {
      (s[table] as Tables[T][]) = (s[table] as Tables[T][]).filter((r) => (r as { id: string }).id !== id) as never;
    });
  }
  removeWhere<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    return this.mutate((s) => {
      (s[table] as Tables[T][]) = (s[table] as Tables[T][]).filter((r) => !matches(r, where)) as never;
    });
  }
}
