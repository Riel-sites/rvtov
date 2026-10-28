import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_credits")
      .select("balance, total_granted, total_consumed")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { balance: data?.balance ?? 0, total_granted: data?.total_granted ?? 0, total_consumed: data?.total_consumed ?? 0 };
  });

export interface TokenSummary {
  consumed: number;
  granted: number;
  circulation: number;
  ai_tokens: number;
  ai_cost_usd: number;
  generations: number;
  by_model: { model: string; mode: string; runs: number; tokens: number; cost_usd: number }[];
  users: { user_id: string; email: string; full_name: string | null; balance: number; total_granted: number; total_consumed: number }[];
  transactions: { id: string; user_id: string; email: string | null; amount: number; type: string; reason: string | null; balance_after: number | null; created_at: string }[];
}

export const getTokenSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { hours: number }) => z.object({ hours: z.number().int().min(1).max(24 * 90) }).parse(input))
  .handler(async ({ data, context }): Promise<TokenSummary> => {
    const { data: res, error } = await context.supabase.rpc("admin_token_summary", { _hours: data.hours });
    if (error) throw new Error(error.message === "forbidden" ? "Admins only" : error.message);
    return res as unknown as TokenSummary;
  });

export const adjustUserTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), amount: z.number().int().min(-10000).max(10000), reason: z.string().trim().min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: balance, error } = await context.supabase.rpc("admin_adjust_user_tokens", {
      _user_id: data.userId,
      _amount: data.amount,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message === "forbidden" ? "Admins only" : error.message);
    return { balance: balance as number };
  });

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().email().max(255),
      fullName: z.string().trim().max(120).optional(),
      password: z.string().min(8).max(72),
      tokens: z.number().int().min(0).max(10000),
      reason: z.string().trim().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : {},
    });
    if (error || !created.user) {
      throw new Error(error?.message?.includes("already") ? "A user with this email already exists." : error?.message ?? "Could not create user");
    }
    let balance: number | null = null;
    if (data.tokens > 0) {
      const { data: b, error: adjErr } = await context.supabase.rpc("admin_adjust_user_tokens", {
        _user_id: created.user.id,
        _amount: data.tokens,
        _reason: data.reason || "Manual purchase (added by admin)",
      });
      if (adjErr) throw new Error(`User created, but tokens failed: ${adjErr.message}`);
      balance = b as number;
    }
    return { userId: created.user.id, email: data.email, balance };
  });
