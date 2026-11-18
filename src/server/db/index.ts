// Provider-independent data access. Two implementations:
//   - LocalJsonDb: a JSON file under .data/ (local development / demo mode)
//   - SupabaseDb:  Postgres via the service-role client (ownership is enforced
//     in services; RLS in supabase/migrations protects direct client access)

import type {
  AnimationRecord,
  CharacterPhotoRecord,
  CharacterRecord,
  ExportRecord,
  GenerationJobRecord,
  UserRecord,
} from "@/lib/types";
import { isSupabaseConfigured } from "../config";
import { LocalJsonDb } from "./local";
import { SupabaseDb } from "./supabase";

export interface Tables {
  users: UserRecord;
  characters: CharacterRecord;
  character_photos: CharacterPhotoRecord;
  animations: AnimationRecord;
  generation_jobs: GenerationJobRecord;
  exports: ExportRecord;
}
export type TableName = keyof Tables;

export interface Db {
  insert<T extends TableName>(table: T, row: Tables[T]): Promise<Tables[T]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T] | null>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  find<T extends TableName>(table: T, where: Partial<Tables[T]>): Promise<Tables[T][]>;
  /** rows whose `field` is one of `values` */
  findIn<T extends TableName>(table: T, field: keyof Tables[T], values: unknown[]): Promise<Tables[T][]>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  removeWhere<T extends TableName>(table: T, where: Partial<Tables[T]>): Promise<void>;
}

const g = globalThis as unknown as { __persona3dDb?: Db };

export function db(): Db {
  if (!g.__persona3dDb) g.__persona3dDb = isSupabaseConfigured() ? new SupabaseDb() : new LocalJsonDb();
  return g.__persona3dDb;
}

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
