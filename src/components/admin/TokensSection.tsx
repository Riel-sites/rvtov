import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adjustUserTokens, createCustomer, getTokenSummary, type TokenSummary } from "@/lib/credits.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentRequests } from "@/components/admin/PaymentRequests";

type U = TokenSummary["users"][number];

export function TokensSection({ hours }: { hours: number }) {
  const fetchSummary = useServerFn(getTokenSummary);
  const q = useQuery({
    queryKey: ["token-summary", hours],
    queryFn: () => fetchSummary({ data: { hours } }),
    refetchInterval: 60_000,
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<U | null>(null);

  if (q.isLoading) return <Skeleton className="mt-8 h-40" />;
  if (q.isError)
    return (
      <p className="mt-8 text-sm text-destructive">
        Couldn't load tokens: {q.error instanceof Error ? q.error.message : "error"}
      </p>
    );
  const d = q.data!;
  const users = d.users.filter((u) =>
    `${u.email} ${u.full_name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="mt-12 space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Tokens &amp; Credits</h2>
      <PaymentRequests />
      <AddCustomer />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tokens consumed" value={d.consumed} />
        <Kpi label="Tokens in circulation" value={d.circulation} />
        <Kpi label="AI compute tokens" value={Number(d.ai_tokens).toLocaleString()} />
        <Kpi label="Est. AI cost" value={`$${Number(d.ai_cost_usd).toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">User balances</CardTitle>
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">User</th>
                <th>Balance</th>
                <th>Granted</th>
                <th>Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-t border-border">
                  <td className="py-2">
                    <div className="text-foreground">{u.full_name || u.email}</div>
                    {u.full_name && <div className="text-xs text-muted-foreground">{u.email}</div>}
                  </td>
                  <td>
                    <Badge variant={u.balance > 0 ? "secondary" : "destructive"}>{u.balance}</Badge>
                  </td>
                  <td>{u.total_granted}</td>
                  <td>{u.total_consumed}</td>
                  <td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editing && <AdjustForm user={editing} onClose={() => setEditing(null)} />}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI usage by model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.by_model.length === 0 && <p className="text-muted-foreground">No generations in range.</p>}
            {d.by_model.map((m) => (
              <div key={m.model + m.mode} className="flex justify-between gap-2">
                <span className="text-foreground">
                  {m.model} <span className="text-muted-foreground">· {m.mode}</span>
                </span>
                <span className="text-muted-foreground">
                  {m.runs} runs · {Number(m.tokens).toLocaleString()} tok · ${Number(m.cost_usd).toFixed(2)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Token activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {d.transactions.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
            {d.transactions.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 border-b border-border pb-1">
                <span>
                  <span className={t.amount > 0 ? "text-accent" : "text-destructive"}>
                    {t.amount > 0 ? `+${t.amount}` : t.amount}
                  </span>{" "}
                  <span className="text-foreground">{t.email ?? t.user_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground"> · {t.reason ?? t.type}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function AdjustForm({ user, onClose }: { user: U; onClose: () => void }) {
  const adjust = useServerFn(adjustUserTokens);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => adjust({ data: { userId: user.user_id, amount: Number(amount), reason } }),
    onSuccess: (r) => {
      toast.success(`New balance: ${r.balance}`);
      void qc.invalidateQueries({ queryKey: ["token-summary"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Adjustment failed"),
  });
  const valid = Number.isInteger(Number(amount)) && Number(amount) !== 0 && reason.trim().length > 0;
  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <p className="text-sm text-foreground">
        Adjust tokens for <strong>{user.email}</strong> (current: {user.balance}). Use a negative number to remove.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />
        <Button onClick={() => m.mutate()} disabled={!valid || m.isPending}>
          {m.isPending ? "Saving…" : "Apply"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function AddCustomer() {
  const create = useServerFn(createCustomer);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(genPassword);
  const [tokens, setTokens] = useState("10");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<{ email: string; password: string; balance: number | null } | null>(null);
  const m = useMutation({
    mutationFn: () =>
      create({ data: { email, fullName: name || undefined, password, tokens: Number(tokens) || 0, reason: reason || undefined } }),
    onSuccess: (r) => {
      setDone({ email: r.email, password, balance: r.balance });
      toast.success("Customer created");
      void qc.invalidateQueries({ queryKey: ["token-summary"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const reset = () => {
    setEmail(""); setName(""); setPassword(genPassword()); setTokens("10"); setReason(""); setDone(null);
  };
  if (!open)
    return (
      <Button onClick={() => { reset(); setOpen(true); }}>Add customer</Button>
    );
  const creds = done
    ? `Your try-on account is ready.\nSign in at ${window.location.origin}/auth\nEmail: ${done.email}\nPassword: ${done.password}`
    : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {done ? (
          <>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-foreground">{creds}</pre>
            <p className="text-muted-foreground">Balance: {done.balance ?? "starter tokens only"}</p>
            <div className="flex gap-2">
              <Button onClick={() => { void navigator.clipboard.writeText(creds); toast.success("Copied"); }}>Copy credentials</Button>
              <Button variant="outline" onClick={reset}>Add another</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Full name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex gap-2">
                <Input placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>New</Button>
              </div>
              <Input type="number" placeholder="Tokens purchased" value={tokens} onChange={(e) => setTokens(e.target.value)} />
            </div>
            <Input placeholder="Payment note (e.g. Invoice #101, bank transfer)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">Purchased tokens are added on top of the free starter tokens.</p>
            <div className="flex gap-2">
              <Button onClick={() => m.mutate()} disabled={m.isPending || !email.includes("@") || password.length < 8}>
                {m.isPending ? "Creating…" : "Create customer"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
