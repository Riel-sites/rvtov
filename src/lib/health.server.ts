import { logHealthCheck } from "@/lib/monitoring.server";

export type ProbeStatus = "up" | "degraded" | "down";

export interface HealthReport {
  status: ProbeStatus;
  checked_at: string;
  checks: { target: string; status: ProbeStatus; response_ms: number; error: string | null }[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; result?: T; error?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { ms: Date.now() - start, result };
  } catch (e) {
    return { ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Probes the database and AI gateway, records each result, and returns a summary. */
export async function probeHealth(): Promise<HealthReport> {
  const checks: HealthReport["checks"] = [];

  // Database: the cheapest possible read via the service client. A paused
  // backend surfaces here as a connection/HTTP error rather than a site outage.
  const db = await timed(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").select("id", { head: true, count: "exact" });
    if (error) throw new Error(error.message);
    return true;
  });
  const dbStatus: ProbeStatus = db.error ? "down" : db.ms > 2500 ? "degraded" : "up";
  checks.push({ target: "database", status: dbStatus, response_ms: db.ms, error: db.error ?? null });

  // AI gateway: lightweight reachability check (no generation, no credits).
  const ai = await timed(async () => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      if (res.status >= 500) throw new Error(`gateway ${res.status}`);
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  });
  const aiStatus: ProbeStatus = ai.error ? "down" : ai.ms > 4000 ? "degraded" : "up";
  checks.push({ target: "ai_gateway", status: aiStatus, response_ms: ai.ms, error: ai.error ?? null });

  // The site itself answered this request, so it is up by definition.
  checks.push({ target: "site", status: "up", response_ms: 0, error: null });

  const overall: ProbeStatus = checks.some((c) => c.status === "down")
    ? "down"
    : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "up";

  // Only persist when the database is reachable; otherwise there is nowhere to write.
  if (dbStatus !== "down") {
    await Promise.all(checks.map((c) => logHealthCheck(c)));
  }

  return { status: overall, checked_at: new Date().toISOString(), checks };
}
