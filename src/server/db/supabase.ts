import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { Db, TableName, Tables } from "./index";

let client: SupabaseClient | null = null;
export function serviceClient() {
  if (!client)
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }) {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Service-role access. Callers (services) always scope queries to the authenticated user. */
export class SupabaseDb implements Db {
  private c = serviceClient();

  async insert<T extends TableName>(table: T, row: Tables[T]) {
    return check(await this.c.from(table).insert(row as never).select().single()) as Tables[T];
  }
  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    return check(await this.c.from(table).update(patch as never).eq("id", id).select().maybeSingle()) as Tables[T] | null;
  }
  async get<T extends TableName>(table: T, id: string) {
    return check(await this.c.from(table).select("*").eq("id", id).maybeSingle()) as Tables[T] | null;
  }
  async find<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    let q = this.c.from(table).select("*");
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as never);
    return (check(await q) ?? []) as Tables[T][];
  }
  async findIn<T extends TableName>(table: T, field: keyof Tables[T], values: unknown[]) {
    if (!values.length) return [];
    return (check(await this.c.from(table).select("*").in(field as string, values as never[])) ?? []) as Tables[T][];
  }
  async remove<T extends TableName>(table: T, id: string) {
    check(await this.c.from(table).delete().eq("id", id));
  }
  async removeWhere<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    let q = this.c.from(table).delete();
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as never);
    check(await q);
  }
}
