import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PHOTO_BUCKET = "try-on-photos";
const MAX_BYTES = 8 * 1024 * 1024;

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported image format. Use PNG, JPEG, or WEBP.");
  const contentType = match[1]!;
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const binary = atob(match[3]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.byteLength === 0) throw new Error("Uploaded image is empty.");
  if (bytes.byteLength > MAX_BYTES) throw new Error("Image is larger than 8MB.");
  return { bytes, contentType, ext };
}

/**
 * Stores the shopper's photo in the private try-on-photos bucket and opens a
 * try-on session row. Returns a short-lived signed URL for previewing it.
 */
export const uploadTryOnPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dataUrl: z.string().min(32),
        productId: z.string().uuid().optional(),
        prompt: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bytes, contentType, ext } = decodeDataUrl(data.dataUrl);
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await context.supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: session, error: sessionError } = await context.supabase
      .from("try_on_sessions")
      .insert({
        user_id: context.userId,
        product_id: data.productId ?? null,
        original_photo_url: path,
        prompt: data.prompt ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    const { data: signed, error: signedError } = await context.supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw signedError;

    return { sessionId: session.id, path, signedUrl: signed.signedUrl };
  });

/**
 * Persists the generated try-on image next to the source photo and completes
 * the session.
 */
export const saveTryOnResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        dataUrl: z.string().min(32),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bytes, contentType, ext } = decodeDataUrl(data.dataUrl);
    const path = `${context.userId}/results/${data.sessionId}.${ext}`;

    const { error: uploadError } = await context.supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    // Only the first completion of a session is charged (prevents double charges).
    const { data: updated, error: updateError } = await context.supabase
      .from("try_on_sessions")
      .update({ result_image_url: path, status: "completed", updated_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .neq("status", "completed")
      .select("id");
    if (updateError) throw updateError;

    if (updated && updated.length > 0) {
      const { consumeToken } = await import("@/lib/monitoring.server");
      await consumeToken(context.userId, "Try-on");
    }

    const { data: signed, error: signedError } = await context.supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw signedError;

    return { path, signedUrl: signed.signedUrl };
  });

export const markTryOnFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("try_on_sessions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/** Past try-on sessions with signed URLs for the stored images. */
export const getTryOnSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("try_on_sessions")
      .select("id, status, prompt, created_at, original_photo_url, result_image_url, product:products(id, name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;

    const rows = data ?? [];
    const paths = rows.flatMap((row) =>
      [row.original_photo_url, row.result_image_url].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );

    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
      }
    }

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      prompt: row.prompt,
      createdAt: row.created_at,
      product: row.product,
      originalUrl: row.original_photo_url ? signedByPath.get(row.original_photo_url) ?? null : null,
      resultUrl: row.result_image_url ? signedByPath.get(row.result_image_url) ?? null : null,
    }));
  });
