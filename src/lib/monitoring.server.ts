// Server-only monitoring helpers. Never import from client-reachable modules
// at module scope; load via `await import("@/lib/monitoring.server")`.
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type MonitoringEventType =
  | "tryon_started"
  | "tryon_succeeded"
  | "tryon_failed"
  | "client_error"
  | "page_error"
  | "server_error"
  | "signup"
  | "role_changed";

export interface MonitoringEventInput {
  event_type: MonitoringEventType;
  user_id?: string | null;
  route?: string | null;
  mode?: string | null;
  model?: string | null;
  duration_ms?: number | null;
  status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  detail?: Record<string, Json>;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
}

const MAX_MESSAGE = 1000;

/** Fire-and-forget event write. Never throws; failures are only logged. */
export async function logMonitoringEvent(input: MonitoringEventInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("monitoring_events").insert({
      event_type: input.event_type,
      user_id: input.user_id ?? null,
      route: input.route ?? null,
      mode: input.mode ?? null,
      model: input.model ?? null,
      duration_ms: input.duration_ms ?? null,
      status: input.status ?? null,
      error_code: input.error_code ?? null,
      error_message: input.error_message ? input.error_message.slice(0, MAX_MESSAGE) : null,
      detail: (input.detail ?? {}) as Json,
      prompt_tokens: input.prompt_tokens ?? null,
      completion_tokens: input.completion_tokens ?? null,
      total_tokens: input.total_tokens ?? null,
      cost_usd: input.cost_usd ?? null,
    });
    if (error) console.error("[monitoring] insert failed:", error.message);
  } catch (e) {
    console.error("[monitoring] insert threw:", e instanceof Error ? e.message : e);
  }
}

export async function logHealthCheck(input: {
  target: string;
  status: "up" | "degraded" | "down";
  response_ms?: number | null;
  error?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("health_checks").insert({
      target: input.target,
      status: input.status,
      response_ms: input.response_ms ?? null,
      error: input.error ? input.error.slice(0, MAX_MESSAGE) : null,
    });
    if (error) console.error("[monitoring] health insert failed:", error.message);
  } catch (e) {
    console.error("[monitoring] health insert threw:", e instanceof Error ? e.message : e);
  }
}

/** Resolve the signed-in user id from a bearer token (if any) without throwing. */
export async function resolveUserIdFromBearer(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return null;
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Turn an upstream AI gateway failure into a short, friendly error code. */
export function classifyUpstreamError(status: number, bodyText: string): { code: string; message: string } {
  if (status === 429) return { code: "rate_limited", message: "AI gateway rate limit reached" };
  if (status === 402) return { code: "credits_exhausted", message: "AI credits exhausted" };
  if (status === 401 || status === 403) return { code: "unauthorized", message: "AI gateway rejected the request" };
  if (status >= 500) return { code: "upstream_error", message: `AI gateway error (${status})` };
  return { code: `http_${status}`, message: bodyText.slice(0, 200) || `HTTP ${status}` };
}

export async function getTokenBalance(userId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
  return data?.balance ?? 0;
}

/** Atomically deduct one token. Returns the new balance, or -1 if none left. */
export async function consumeToken(userId: string, reason: string): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("consume_user_token", { _user_id: userId, _reason: reason });
    if (error) console.error("[credits] consume failed:", error.message);
    return (data as number | null) ?? -1;
  } catch (e) {
    console.error("[credits] consume threw:", e instanceof Error ? e.message : e);
    return -1;
  }
}

// Rough per-1M-token USD rates used only for the admin cost estimate.
const RATES: Record<string, { in: number; out: number }> = {
  "google/gemini-3-pro-image": { in: 2, out: 120 },
  "openai/gpt-image-2": { in: 5, out: 40 },
};

export function estimateCostUsd(model: string, promptTokens: number | null, completionTokens: number | null): number | null {
  const r = RATES[model];
  if (!r || (promptTokens == null && completionTokens == null)) return null;
  return Math.round((((promptTokens ?? 0) * r.in + (completionTokens ?? 0) * r.out) / 1_000_000) * 10000) / 10000;
}
