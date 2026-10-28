import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getStyle } from "@/lib/styles";

const BUCKET = "try-on-photos";

/** Saves a styled variant (idempotent by variantId) and charges the style's token cost once. */
export const saveStyleVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ variantId: z.string().uuid(), sessionId: z.string().uuid(), style: z.string(), dataUrl: z.string().min(32) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const style = getStyle(data.style);
    if (!style) throw new Error("Unknown style");
    const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("Unsupported image");
    const bin = atob(m[3]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `${context.userId}/styles/${data.variantId}.png`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owned } = await supabaseAdmin.from("try_on_sessions").select("id").eq("id", data.sessionId).eq("user_id", context.userId).maybeSingle();
    if (!owned) throw new Error("Not your image");

    const { error: up } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: m[1]!, upsert: true });
    if (up) throw up;
    const { data: inserted, error } = await supabaseAdmin
      .from("style_variants")
      .upsert({ id: data.variantId, user_id: context.userId, session_id: data.sessionId, style: style.id, token_cost: style.cost, image_path: path }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    if (inserted && inserted.length > 0) {
      const { consumeToken } = await import("@/lib/monitoring.server");
      for (let i = 0; i < style.cost; i++) await consumeToken(context.userId, `Style: ${style.name}`);
    }
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
    return { url: signed?.signedUrl ?? null };
  });

export const listStyleVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("style_variants")
      .select("id, session_id, style, token_cost, image_path, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const rows = data ?? [];
    const signed = rows.length
      ? (await context.supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.image_path), 3600)).data ?? []
      : [];
    const map = new Map(signed.map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => ({ id: r.id, sessionId: r.session_id, style: r.style, cost: r.token_cost, createdAt: r.created_at, url: map.get(r.image_path) ?? null }));
  });
