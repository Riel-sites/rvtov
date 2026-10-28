import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getMyCredits } from "@/lib/credits.functions";
import { getTryOnSessions } from "@/lib/tryon.functions";
import { listStyleVariants, saveStyleVariant } from "@/lib/styles.functions";
import { STYLES, getStyle } from "@/lib/styles";
import { streamImage } from "@/lib/streamImage";
import { ProtectedImage } from "@/components/ProtectedImage";

export const Route = createFileRoute("/styles")({
  validateSearch: z.object({ session: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Add Styles — Virtual Try-On" },
      { name: "description", content: "Turn your try-on photos into watercolor, editorial, noir and cinematic art." },
      { property: "og:title", content: "Add Styles — Virtual Try-On" },
      { property: "og:description", content: "Apply art styles to your generated try-on images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StylesPage,
});

function StylesPage() {
  const { user, isLoading } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const sessionsFn = useServerFn(getTryOnSessions);
  const creditsFn = useServerFn(getMyCredits);
  const variantsFn = useServerFn(listStyleVariants);
  const saveFn = useServerFn(saveStyleVariant);
  const enabled = !!user;
  const sessions = useQuery({ queryKey: ["tryon-sessions"], queryFn: () => sessionsFn(), enabled });
  const credits = useQuery({ queryKey: ["my-credits"], queryFn: () => creditsFn(), enabled });
  const variants = useQuery({ queryKey: ["style-variants"], queryFn: () => variantsFn(), enabled });

  const completed = (sessions.data ?? []).filter((s) => s.status === "completed" && s.resultUrl);
  const [picked, setPicked] = useState<string | null>(search.session ?? null);
  const source = completed.find((s) => s.id === picked) ?? completed[0];
  const [styleId, setStyleId] = useState<string>(STYLES[0].id);
  const [intensity, setIntensity] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const balance = (credits.data as { balance?: number } | undefined)?.balance ?? 0;
  const style = getStyle(styleId)!;

  if (isLoading) return null;
  if (!user)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground">Sign in to style your try-on images.</p>
        <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
      </div>
    );

  async function run() {
    if (!source) return;
    if (style.cost >= 2 && !confirm(`This style costs ${style.cost} tokens. Continue?`)) return;
    setBusy(true);
    setPreview(null);
    try {
      const final = await streamImage("/api/generate-style", { sessionId: source.id, style: style.id, intensity }, (f) => setPreview(f.dataUrl));
      if (!final) throw new Error("No image was returned. You were not charged.");
      await saveFn({ data: { variantId: crypto.randomUUID(), sessionId: source.id, style: style.id, dataUrl: final } });
      toast.success(`${style.name} added — ${style.cost} token${style.cost > 1 ? "s" : ""} used`);
      void qc.invalidateQueries({ queryKey: ["style-variants"] });
      void qc.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Styling failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-semibold text-foreground"><Palette className="h-7 w-7" /> Add Styles</h1>
        <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">{balance} tokens</span>
      </div>

      {completed.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No finished try-ons yet. <Link to="/try-on" className="underline">Create one first</Link>.</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{preview ? "Styled preview" : "Original"}</p>
            <div className="mx-auto aspect-[4/5] max-w-sm overflow-hidden rounded-xl border border-border bg-muted">
              <ProtectedImage src={preview ?? source!.resultUrl!} alt="Selected image" className={`h-full w-full object-cover ${busy ? "blur-sm" : ""}`} sessionId={preview ? null : source!.id} />
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {completed.map((s) => (
                <button key={s.id} onClick={() => { setPicked(s.id); setPreview(null); }} className={`h-20 w-16 shrink-0 overflow-hidden rounded-md border-2 ${s.id === source?.id ? "border-primary" : "border-transparent"}`}>
                  <img src={s.resultUrl!} alt="" className="h-full w-full object-cover" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => setStyleId(s.id)} className={`rounded-xl border p-4 text-left transition ${s.id === styleId ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.cost} token{s.cost > 1 ? "s" : ""}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                </button>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm text-foreground">Intensity</p>
              <div className="flex gap-2">
                {["subtle", "balanced", "bold"].map((i) => (
                  <Button key={i} size="sm" variant={intensity === i ? "default" : "outline"} onClick={() => setIntensity(i)} className="capitalize">{i}</Button>
                ))}
              </div>
            </div>
            {balance < style.cost ? (
              <Button asChild className="w-full"><Link to="/try-on" hash="topup">Not enough tokens — top up</Link></Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={run}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Styling…</> : `Apply ${style.name} (${style.cost} token${style.cost > 1 ? "s" : ""})`}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Tokens are only used when the styled image is created. Your original stays untouched.</p>
          </div>
        </div>
      )}

      {variants.data && variants.data.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold text-foreground">Your styled images</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {variants.data.map((v) => (
              <div key={v.id} className="space-y-1">
                <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
                  {v.url && <ProtectedImage src={v.url} alt={v.style} className="h-full w-full object-cover" filename={`styled-${v.id}.png`} sessionId={null} />}
                </div>
                <p className="text-xs text-muted-foreground">{getStyle(v.style)?.name ?? v.style}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
