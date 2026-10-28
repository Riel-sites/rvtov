import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MonitoringRange = 24 | 168 | 720;

export interface MonitoringSummary {
  since: string;
  generation: {
    started: number;
    succeeded: number;
    failed: number;
    median_ms: number | null;
    p95_ms: number | null;
  };
  by_mode: { mode: string; succeeded: number; failed: number }[];
  recent_failures: {
    created_at: string;
    mode: string | null;
    model: string | null;
    error_code: string | null;
    error_message: string;
  }[];
  error_groups: { message: string; route: string; count: number; last_seen: string }[];
  daily: { day: string; tryons: number; errors: number }[];
  health: {
    target: string;
    status: string;
    response_ms: number | null;
    error: string | null;
    created_at: string;
  }[];
  usage: {
    signups: number;
    total_users: number;
    active_users: number;
    tryon_sessions: number;
    users_with_tryon: number;
    orders: number;
  };
  top_products: { name: string; tryons: number }[];
}

/** Admin-only dashboard summary. The SQL function re-checks the admin role itself. */
export const getMonitoringSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ hours: z.union([z.literal(24), z.literal(168), z.literal(720)]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: summary, error } = await context.supabase.rpc("admin_monitoring_summary", {
      _hours: data.hours,
    });
    if (error) throw new Error(error.message);
    return summary as unknown as MonitoringSummary;
  });

/** Runs the live health probe and records it (admin only). */
export const runHealthProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { probeHealth } = await import("@/lib/health.server");
    return probeHealth();
  });

/**
 * Public client-error reporter. Accepts only a short message/stack/route so it
 * cannot be abused to store arbitrary payloads.
 */
export const reportClientError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        message: z.string().min(1).max(500),
        stack: z.string().max(2000).optional(),
        route: z.string().max(200).optional(),
        kind: z.enum(["client_error", "page_error"]).default("client_error"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { logMonitoringEvent } = await import("@/lib/monitoring.server");
    await logMonitoringEvent({
      event_type: data.kind,
      route: data.route ?? null,
      error_message: data.message,
      detail: data.stack ? { stack: data.stack.slice(0, 2000) } : {},
    });
    return { ok: true };
  });
