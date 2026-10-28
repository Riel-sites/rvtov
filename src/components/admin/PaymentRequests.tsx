import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listPaymentRequests, reviewPaymentRequest } from "@/lib/payments.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PaymentRequests() {
  const qc = useQueryClient();
  const list = useServerFn(listPaymentRequests);
  const review = useServerFn(reviewPaymentRequest);
  const q = useQuery({ queryKey: ["payment-requests"], queryFn: () => list(), refetchInterval: 30_000 });
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => review({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Approved — tokens credited" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["payment-requests"] });
      qc.invalidateQueries({ queryKey: ["token-summary"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rows = q.data ?? [];
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Payment requests {pending > 0 && <Badge className="ml-2">{pending} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment requests yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="pr-3">Customer</th>
                <th className="pr-3">Pack</th>
                <th className="pr-3">Paid from</th>
                <th className="pr-3">Transaction ID</th>
                <th className="pr-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="pr-3">{r.email}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {r.kind === "download" ? "Image download" : `${r.pack_name} · ${r.tokens}`} · ${Number(r.price_usd)}
                    {r.local_amount && <span className="block text-xs text-muted-foreground">{r.local_amount}</span>}
                  </td>
                  <td className="pr-3">{r.sender_phone}</td>
                  <td className="pr-3 font-mono text-xs">{r.transaction_ref}</td>
                  <td className="pr-3">
                    <Badge variant={r.status === "pending" ? "default" : r.status === "approved" ? "secondary" : "destructive"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap py-2">
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, approve: true })}>
                          {r.kind === "download" ? "Approve download" : "Approve & credit"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={m.isPending}
                          onClick={() => confirm("Reject this request?") && m.mutate({ id: r.id, approve: false })}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
