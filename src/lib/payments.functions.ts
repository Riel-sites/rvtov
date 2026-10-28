import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PACKS: Record<string, { tokens: number; price: number }> = {
  Starter: { tokens: 20, price: 5 },
  Popular: { tokens: 50, price: 10 },
  Studio: { tokens: 120, price: 20 },
};

export const DOWNLOAD_PRICE_USD = 0.5;

const submitSchema = z.object({
  pack: z.enum(["Starter", "Popular", "Studio", "Download"]),
  sessionId: z.string().uuid().optional(),
  localAmount: z.string().max(60).optional(),
  senderPhone: z.string().trim().regex(/^[+0-9 ]{6,20}$/, "Enter a valid phone number"),
  transactionRef: z.string().trim().min(3, "Enter the transaction ID").max(64),
});

export const submitPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email ?? "";
    const isDownload = data.pack === "Download";
    if (isDownload && !data.sessionId) throw new Error("Missing image");
    const p = isDownload ? { tokens: 0, price: DOWNLOAD_PRICE_USD } : PACKS[data.pack]!;
    const { error } = await context.supabase.from("payment_requests").insert({
      user_id: context.userId,
      email,
      kind: isDownload ? "download" : "pack",
      session_id: isDownload ? (data.sessionId ?? null) : null,
      local_amount: data.localAmount ?? null,
      pack_name: isDownload ? "Image download" : data.pack,
      tokens: p.tokens,
      price_usd: p.price,
      sender_phone: data.senderPhone,
      transaction_ref: data.transactionRef,
    });
    if (error) throw new Error("Couldn't submit your payment. Please try again.");
    return { ok: true };
  });

/** Paid users (any approved pack) download freely; trial users need a paid unlock per image. */
export const getDownloadAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_requests")
      .select("kind, status, session_id")
      .eq("user_id", context.userId)
      .neq("status", "rejected");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return {
      paid: rows.some((r) => r.kind === "pack" && r.status === "approved"),
      unlocked: rows.filter((r) => r.kind === "download" && r.status === "approved").map((r) => r.session_id as string),
      pending: rows.filter((r) => r.kind === "download" && r.status === "pending").map((r) => r.session_id as string),
    };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const listPaymentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const reviewPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: claimed, error } = await context.supabase
      .from("payment_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed) throw new Error("This request was already reviewed.");
    if (data.approve && claimed.kind !== "download") {
      const { error: adjErr } = await context.supabase.rpc("admin_adjust_user_tokens", {
        _user_id: claimed.user_id,
        _amount: claimed.tokens,
        _reason: `MoMo ${claimed.pack_name} pack · ref ${claimed.transaction_ref}`,
      });
      if (adjErr) {
        await context.supabase.from("payment_requests").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", data.id);
        throw new Error("Couldn't credit tokens: " + adjErr.message);
      }
    }
    return { ok: true };
  });
