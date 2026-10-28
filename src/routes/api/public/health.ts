import { createFileRoute } from "@tanstack/react-router";

/**
 * Public uptime probe: GET /api/public/health
 * Returns { status: up|degraded|down, checks: [...] } with HTTP 200 when healthy
 * and 503 when any dependency is down. Contains no user data. Safe to poll from
 * an external uptime monitor.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { probeHealth } = await import("@/lib/health.server");
          const report = await probeHealth();
          return Response.json(report, {
            status: report.status === "down" ? 503 : 200,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (e) {
          return Response.json(
            {
              status: "down",
              checked_at: new Date().toISOString(),
              checks: [],
              error: e instanceof Error ? e.message : "probe failed",
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
