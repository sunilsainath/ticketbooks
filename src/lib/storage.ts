import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Object storage abstraction.
 * - "supabase": files live in a Supabase Storage bucket (required on Vercel,
 *   where the serverless filesystem is ephemeral)
 * - "local":    files under UPLOAD_DIR (default, fine for self-hosting)
 */

export type StorageMode = "supabase" | "local";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "attachments";

export function storageMode(): StorageMode {
  return SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

function localDir(): string {
  // Vercel's filesystem is read-only except /tmp
  if (process.env.VERCEL) return path.join("/tmp", "uploads");
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
}

async function saveLocal(key: string, data: Buffer) {
  const dir = localDir();
  await mkdir(dir, { recursive: true });
  // key is a generated uuid+ext produced by our own code - no user input in path
  await writeFile(path.join(dir, key), data);
}

async function readLocal(key: string): Promise<Buffer> {
  return readFile(path.join(localDir(), path.basename(key)));
}

async function supabaseFetch(key: string, method: "PUT" | "GET", body?: Buffer): Promise<Response> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(method === "PUT" ? { "Content-Type": "application/octet-stream", "x-upsert": "true" } : {}),
    },
    ...(body ? { body: new Uint8Array(body) } : {}),
  });
}

async function saveSupabase(key: string, data: Buffer) {
  const res = await supabaseFetch(key, "PUT", data);
  if (!res.ok) throw new Error(`Supabase Storage upload failed (${res.status}): ${await res.text().catch(() => "")}`);
}

async function readSupabase(key: string): Promise<Buffer> {
  const res = await supabaseFetch(key, "GET");
  if (!res.ok) throw new Error(`Supabase Storage download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function saveObject(key: string, data: Buffer): Promise<void> {
  if (storageMode() === "supabase") return saveSupabase(key, data);
  return saveLocal(key, data);
}

export async function readObject(key: string): Promise<Buffer> {
  if (storageMode() === "supabase") return readSupabase(key);
  return readLocal(key);
}
