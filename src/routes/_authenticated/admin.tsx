import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  getMonitoringSummary,
  runHealthProbe,
  type MonitoringRange,
  type MonitoringSummary,
} from "@/lib/monitoring.functions";
import { TokensSection } from "@/components/admin/TokensSection";
import { listUsers, setUserRole, resetUserPassword, type AdminUser } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Monitoring | Virtual Try-On" },
      { name: "description", content: "Admin monitoring: uptime, AI generation health, errors and usage." },
      { property: "og:title", content: "Monitoring | Virtual Try-On" },
      { property: "og:description", content: "Admin monitoring for the Virtual Try-On platform." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const RANGES: { value: MonitoringRange; label: string }[] = [
  { value: 24, label: "24h" },
  { value: 168, label: "7d" },
  { value: 720, label: "30d" },
];

function AdminPage() {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account doesn't have access to the monitoring dashboard.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const [hours, setHours] = useState<MonitoringRange>(24);
  const fetchSummary = useServerFn(getMonitoringSummary);
  const probe = useServerFn(runHealthProbe);
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["monitoring-summary", hours],
    queryFn: () => fetchSummary({ data: { hours } }),
    refetchInterval: 60_000,
  });

  const probeMutation = useMutation({
    mutationFn: () => probe(),
    onSuccess: (report) => {
      toast[report.status === "up" ? "success" : "warning"](`Health check: ${report.status}`);
      void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Health check failed"),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Uptime, AI generation health, errors and usage. Auto-refreshes every minute.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setHours(r.value)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  hours === r.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => summary.refetch()} disabled={summary.isFetching}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => probeMutation.mutate()} disabled={probeMutation.isPending}>
            {probeMutation.isPending ? "Checking…" : "Run health check"}
          </Button>
        </div>
      </div>

      {summary.isError && (
        <Card className="mt-8 border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            Couldn't load monitoring data: {summary.error instanceof Error ? summary.error.message : "Unknown error"}
          </CardContent>
        </Card>
      )}

      {summary.isLoading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {summary.data && <Sections data={summary.data} />}

      <TokensSection hours={hours} />
    </div>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "up") return "default";
  if (status === "degraded") return "secondary";
  if (status === "down") return "destructive";
  return "outline";
}

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function Sections({ data }: { data: MonitoringSummary }) {
  const g = data.generation;
  const total = g.succeeded + g.failed;
  const successRate = total > 0 ? Math.round((g.succeeded / total) * 100) : null;
  const targets = ["site", "database", "ai_gateway"] as const;
  const healthByTarget = new Map(data.health.map((h) => [h.target, h]));
  const maxDaily = Math.max(1, ...data.daily.map((d) => Math.max(d.tryons, d.errors)));

  return (
    <div className="mt-8 space-y-8">
      {/* Status strip */}
      <section className="grid gap-4 sm:grid-cols-3">
        {targets.map((t) => {
          const h = healthByTarget.get(t);
          return (
            <Card key={t}>
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <p className="text-sm font-medium capitalize text-foreground">{t.replace("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {h ? `${fmtMs(h.response_ms)} · ${fmtTime(h.created_at)}` : "Not checked yet"}
                  </p>
                  {h?.error && <p className="mt-1 max-w-[220px] truncate text-xs text-destructive">{h.error}</p>}
                </div>
                <Badge variant={statusVariant(h?.status ?? "unknown")} className="capitalize">
                  {h?.status ?? "unknown"}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* AI generation health */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">AI generation health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Success rate" value={successRate == null ? "—" : `${successRate}%`} />
          <Stat label="Started" value={g.started} />
          <Stat label="Succeeded" value={g.succeeded} />
          <Stat label="Failed" value={g.failed} {...(g.failed > 0 ? { tone: "bad" as const } : {})} />
          <Stat label="Latency (p50 / p95)" value={`${fmtMs(g.median_ms)} / ${fmtMs(g.p95_ms)}`} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">By generation mode</CardTitle>
            </CardHeader>
            <CardContent>
              {data.by_mode.length === 0 ? (
                <Empty>No generations in this window.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">OK</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_mode.map((m) => (
                      <TableRow key={m.mode}>
                        <TableCell>{m.mode}</TableCell>
                        <TableCell className="text-right">{m.succeeded}</TableCell>
                        <TableCell className="text-right">{m.failed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Recent failures</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent_failures.length === 0 ? (
                <Empty>No failed generations. Nice.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_failures.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtTime(f.created_at)}</TableCell>
                        <TableCell className="text-xs">{f.mode ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono text-accent">{f.error_code ?? "error"}</span>{" "}
                          <span className="text-muted-foreground">{f.error_message}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Errors */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Errors & crashes</h2>
        <Card>
          <CardContent className="pt-6">
            {data.error_groups.length === 0 ? (
              <Empty>No client or page errors recorded in this window.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.error_groups.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-md truncate text-xs">{e.message}</TableCell>
                      <TableCell className="font-mono text-xs">{e.route}</TableCell>
                      <TableCell className="text-right">{e.count}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs">{fmtTime(e.last_seen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Usage */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Usage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Stat label="New signups" value={data.usage.signups} />
          <Stat label="Total users" value={data.usage.total_users} />
          <Stat label="Active users" value={data.usage.active_users} />
          <Stat label="Try-on sessions" value={data.usage.tryon_sessions} />
          <Stat label="Users who tried on" value={data.usage.users_with_tryon} />
          <Stat label="Orders" value={data.usage.orders} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Daily activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.daily.length === 0 ? (
                <Empty>No activity yet.</Empty>
              ) : (
                <div className="flex h-40 items-end gap-1">
                  {data.daily.map((d) => (
                    <div key={d.day} className="group flex flex-1 flex-col items-center gap-0.5" title={`${new Date(d.day).toLocaleDateString()}: ${d.tryons} try-ons, ${d.errors} errors`}>
                      <div className="flex w-full items-end gap-px" style={{ height: "128px" }}>
                        <div className="flex-1 rounded-t bg-primary" style={{ height: `${(d.tryons / maxDaily) * 100}%` }} />
                        <div className="flex-1 rounded-t bg-destructive/70" style={{ height: `${(d.errors / maxDaily) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(d.day).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Try-ons</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/70" /> Errors</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Most tried-on products</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_products.length === 0 ? (
                <Empty>No product try-ons yet.</Empty>
              ) : (
                <ul className="space-y-2">
                  {data.top_products.map((p) => (
                    <li key={p.name} className="flex items-center justify-between text-sm">
                      <span className="truncate text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">{p.tryons}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: "Signed up (all time)", value: data.usage.total_users },
                { label: "Active in window", value: data.usage.active_users },
                { label: "Uploaded a photo", value: data.usage.users_with_tryon },
                { label: "Generated a result", value: data.generation.succeeded > 0 ? data.usage.users_with_tryon : 0 },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      <UsersSection />

      <p className="text-xs text-muted-foreground">
        External uptime monitors can poll <code className="rounded bg-muted px-1 py-0.5">/api/public/health</code>{" "}
        (returns 200 when healthy, 503 when a dependency is down).
      </p>
    </div>
  );
}

function UsersSection() {
  const { user: me } = useAuth();
  const fetchUsers = useServerFn(listUsers);
  const setRole = useServerFn(setUserRole);
  const resetPassword = useServerFn(resetUserPassword);
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: "admin" | "brand"; grant: boolean }) =>
      setRole({ data: input }),
    onSuccess: (_, v) => {
      toast.success(`${v.role} role ${v.grant ? "granted" : "revoked"}`);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update role"),
  });

  const passwordMutation = useMutation({
    mutationFn: (input: { userId: string; password: string }) => resetPassword({ data: input }),
    onSuccess: () => {
      toast.success("Password updated. Share the new password with the user.");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't reset password"),
  });

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    setNewPassword(Array.from(arr, (n) => chars[n % chars.length]).join(""));
  };

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">Users &amp; access</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <p className="text-xs text-muted-foreground">
            Everyone is a shopper by default. Grant <strong>brand</strong> to retailers and <strong>admin</strong> to
            teammates who need full access.
          </p>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : users.isError ? (
            <Empty>{users.error instanceof Error ? users.error.message : "Couldn't load users."}</Empty>
          ) : !users.data || users.data.length === 0 ? (
            <Empty>No accounts yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((u) => {
                  const isSelf = u.id === me?.id;
                  const hasBrand = u.roles.includes("brand");
                  const hasAdmin = u.roles.includes("admin");
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="text-sm text-foreground">
                          {u.full_name || u.email}
                          {isSelf && <span className="ml-2 text-xs text-accent">(you)</span>}
                        </div>
                        {u.full_name && <div className="text-xs text-muted-foreground">{u.email}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <Badge variant="outline">none</Badge>
                          ) : (
                            u.roles.map((r) => (
                              <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                                {r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant={hasBrand ? "secondary" : "outline"}
                            disabled={roleMutation.isPending}
                            onClick={() => roleMutation.mutate({ userId: u.id, role: "brand", grant: !hasBrand })}
                          >
                            {hasBrand ? "Revoke brand" : "Make brand"}
                          </Button>
                          <Button
                            size="sm"
                            variant={hasAdmin ? "secondary" : "outline"}
                            disabled={roleMutation.isPending || (isSelf && hasAdmin)}
                            title={isSelf && hasAdmin ? "You can't remove your own admin role" : undefined}
                            onClick={() => roleMutation.mutate({ userId: u.id, role: "admin", grant: !hasAdmin })}
                          >
                            {hasAdmin ? "Revoke admin" : "Make admin"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResetTarget(u);
                              setNewPassword("");
                            }}
                          >
                            Reset password
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetTarget?.email}</strong>. They can sign in with it right away —
              share it with them directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={generatePassword}>
                Generate
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 8 || passwordMutation.isPending}
              onClick={() =>
                resetTarget && passwordMutation.mutate({ userId: resetTarget.id, password: newPassword })
              }
            >
              {passwordMutation.isPending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${tone === "bad" ? "text-destructive" : "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3 text-sm">
          <span className="w-44 shrink-0 text-muted-foreground">{s.label}</span>
          <div className="h-6 flex-1 rounded bg-muted">
            <div className="h-full rounded bg-primary/80" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-foreground">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
