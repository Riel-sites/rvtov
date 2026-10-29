import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Palette, Check, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getMyCredits } from "@/lib/credits.functions";
import { getTryOnSessions } from "@/lib/tryon.functions";
import { listStyleVariants, saveStyleVariant } from "@/lib/styles.functions";
import { STYLES, getStyle, getVariationCount } from "@/lib/styles";
import { streamImage } from "@/lib/streamImage";
import { ProtectedImage } from "@/components/ProtectedImage";
import { TopUpDialog, type TopUpReason } from "@/components/TopUpDialog";
import africanEditorial from "@/assets/styles-african-editorial.jpg";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";

export const Route = createFileRoute("/styles")({
  validateSearch: z.object({ session: z.string().optional() }),
  head: () => ({ meta: [
    { title: "Add Styles & African Fashion Art — Virtual Try-On" },
    { name: "description", content: "Style your try-on photos with watercolor, cinematic art, African textile-inspired looks and natural skin-tone editorials. Create three- or five-image sets." },
    { property: "og:title", content: "Add Styles & African Fashion Art — Virtual Try-On" },
    { property: "og:description", content: "Explore African-inspired presets and curated three- and five-image style sets." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StylesPage,
});

const GROUPS = [
  { name: "Classic looks", ids: ["watercolor", "editorial", "game-cover", "noir", "hd-portrait"] },
  { name: "African fashion & natural skin", ids: ["kente-editorial", "ankara-art", "melanin-editorial"] },
  { name: "Curated sets", ids: ["creative-trio", "african-trio", "cinematic-five"] },
];

type PendingSet = { sessionId: string; style: string; images: { variantId: string; dataUrl: string }[] };

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
  const completed = (sessions.data ?? []).filter(s => s.status === "completed" && s.resultUrl);
  const [picked, setPicked] = useState<string | null>(search.session ?? null);
  const source = completed.find(s => s.id === picked) ?? completed[0];
  const [styleId, setStyleId] = useState<string>(STYLES[0].id);
  const [intensity, setIntensity] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [pendingSet, setPendingSet] = useState<PendingSet | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpReason, setTopUpReason] = useState<TopUpReason>("manual");
  const balance = credits.data?.balance ?? 0;
  const style = getStyle(styleId) ?? STYLES[0];
  const count = getVariationCount(style);

  // Deep-link support: `/styles#topup` (e.g. from a marketing email) opens the
  // dialog once, then we strip the hash so refreshes don't retrigger it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#topup") {
      setTopUpReason("manual");
      setTopUpOpen(true);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  function openTopUp(reason: TopUpReason) {
    setTopUpReason(reason);
    setTopUpOpen(true);
  }

  function selectStyle(nextStyle: string, nextIntensity?: string) {
    if (busy || pendingSet) throw new Error("Wait until the current set is saved.");
    if (!getStyle(nextStyle)) throw new Error("Unknown style preset.");
    if (nextIntensity !== undefined && !["subtle", "balanced", "bold"].includes(nextIntensity)) throw new Error("Unknown intensity; expected subtle, balanced or bold.");
    setStyleId(nextStyle);
    if (nextIntensity !== undefined) setIntensity(nextIntensity);
  }
  function selectOriginal(id: string) {
    if (busy || pendingSet) throw new Error("Wait until the current set is saved.");
    const image = completed.find(s => s.id === id);
    if (!image) throw new Error("Image is not in the current view.");
    setPicked(id); setPreview(null); setOutputs([]);
  }
  useWebMCP({
    name: "read_styles_view",
    description: "Read available styles, current selection and the original images shown on this page. Does not generate or spend tokens.",
    annotations: { readOnlyHint: true },
    execute: () => runWebMCPTool("read_styles_view", () => `${STYLES.map(s => `${s.id}: ${s.name}, ${getVariationCount(s)} images, ${s.cost} tokens`).join("\n")}\nSelected: ${style.id}, ${intensity}.\n${sessions.isPending && user ? "Images are loading." : `Original IDs shown: ${completed.map(s => s.id).join(", ") || "none"}`}`),
  });
  useWebMCP({
    name: "select_style_preset",
    description: "Select a style and optional intensity on this screen without starting generation or spending tokens.",
    enabled: !busy && !pendingSet,
    inputSchema: { type: "object", properties: { style: { type: "string", enum: STYLES.map(s => s.id), description: "Preset ID from the visible style collection." }, intensity: { type: "string", enum: ["subtle", "balanced", "bold"], description: "Optional rendering intensity." } }, required: ["style"], additionalProperties: false },
    execute: ({ style: nextStyle, intensity: nextIntensity }: { style: string; intensity?: string }) => runWebMCPTool("select_style_preset", () => {
      if (typeof nextStyle !== "string" || (nextIntensity !== undefined && typeof nextIntensity !== "string")) throw new Error("Invalid style selection.");
      selectStyle(nextStyle, nextIntensity); return "Style selected. Generation has not started.";
    }),
  });
  useWebMCP({
    name: "select_original_image",
    description: "Select an original from the completed try-on IDs shown on this screen, without changing or generating an image.",
    enabled: !!user && !sessions.isPending && !busy && !pendingSet,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Original image ID from read_styles_view." } }, required: ["id"], additionalProperties: false },
    execute: ({ id }: { id: string }) => runWebMCPTool("select_original_image", () => {
      if (typeof id !== "string") throw new Error("Invalid image ID.");
      selectOriginal(id); return "Original image selected.";
    }),
  });

  async function persist(set: PendingSet) {
    await saveFn({ data: set });
    setPendingSet(null);
    const applied = getStyle(set.style);
    toast.success(`${set.images.length} styled image${set.images.length > 1 ? "s" : ""} saved — ${applied?.cost ?? 0} tokens used`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["style-variants"] }),
      qc.invalidateQueries({ queryKey: ["my-credits"] }),
    ]);
  }

  async function run() {
    if (!source?.resultUrl || busy) return;
    // Intercept insufficient balance in place — open the dialog, keep the user's
    // selected photo + preset, and skip the generation call entirely.
    if (credits.isPending) {
      toast.error("Checking your token balance — try again in a moment.");
      return;
    }
    if (balance < style.cost) {
      openTopUp("insufficient");
      return;
    }
    if (style.cost >= 2 && !window.confirm(`${count} image${count > 1 ? "s" : ""} for ${style.cost} tokens. Tokens are used only after the complete set is saved. Continue?`)) return;
    setBusy(true);
    setPreview(null);
    setOutputs([]);
    setProgress(0);
    setPendingSet(null);
    const images: PendingSet["images"] = [];
    try {
      for (let variation = 0; variation < count; variation++) {
        setProgress(variation + 1);
        setPartial(true);
        const final = await streamImage("/api/generate-style", { sessionId: source.id, style: style.id, intensity, variation }, frame => {
          setPreview(frame.dataUrl);
          setPartial(!frame.final);
        });
        if (!final) throw new Error("The set could not be completed. You were not charged.");
        images.push({ variantId: crypto.randomUUID(), dataUrl: final });
        setOutputs(images.map(image => image.dataUrl));
      }
      const set = { sessionId: source.id, style: style.id, images };
      setPendingSet(set);
      await persist(set);
    } catch (e) {
      if (images.length !== count) { setPreview(null); setOutputs([]); }
      toast.error(e instanceof Error ? e.message : "Styling failed. You were not charged.");
    } finally {
      setPartial(false);
      setBusy(false);
    }
  }

  async function retrySave() {
    if (!pendingSet || busy) return;
    setBusy(true);
    try { await persist(pendingSet); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the set."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-semibold text-foreground"><Palette className="h-7 w-7" /> Add Styles</h1>
        {user && (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground">{balance} tokens</span>
            <Button size="sm" onClick={() => openTopUp("manual")}>Top up</Button>
          </div>
        )}
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
          <p className="text-sm text-muted-foreground">{source ? (preview ? "Styled preview" : "Original") : "African fashion editorial · Sample"}</p>
          <div className="mx-auto aspect-[4/5] max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
            {source?.resultUrl ? (
              <ProtectedImage src={preview ?? source.resultUrl} alt="Selected try-on image" className={`h-full w-full object-contain ${partial ? "blur-sm" : ""}`} sessionId={preview ? null : source.id} />
            ) : (
              <img src={africanEditorial} alt="Ghanaian kente fashion portrait with natural dark skin tones" width={1024} height={1024} className="h-full w-full object-cover" />
            )}
          </div>
          {busy && <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">{pendingSet ? "Saving your set…" : `Creating image ${progress} of ${count}…`}</p>}
          {completed.length > 0 && <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Choose an original image">
            {completed.map(s => s.resultUrl && (
              <Button key={s.id} variant="outline" disabled={busy || !!pendingSet} aria-label={`Select try-on from ${new Date(s.createdAt).toLocaleDateString()}`} aria-pressed={s.id === source?.id}
                onClick={() => selectOriginal(s.id)}
                className={`h-20 w-16 shrink-0 overflow-hidden rounded-md border-2 p-0 ${s.id === source?.id ? "border-primary" : "border-border"}`}>
                <img src={s.resultUrl} alt="" className="h-full w-full object-cover" draggable={false} onContextMenu={e => e.preventDefault()} />
              </Button>
            ))}
          </div>}
          {!isLoading && !user && <Button asChild className="w-full"><Link to="/auth">Sign in to add a style</Link></Button>}
          {user && sessions.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your images…</p>}
          {user && sessions.isError && <p role="alert" className="text-sm text-destructive">Couldn't load your images. <Button variant="link" onClick={() => sessions.refetch()}>Try again</Button></p>}
          {user && !sessions.isPending && !sessions.isError && !source && <Button asChild className="w-full"><Link to="/try-on">Create your first try-on</Link></Button>}
          {outputs.length > 1 && <div className="grid grid-cols-3 gap-2" aria-label="Generated set">
            {outputs.map((url, i) => <div key={i} className="aspect-[4/5] overflow-hidden rounded-md border border-border"><ProtectedImage src={url} alt={`Styled variation ${i + 1}`} className="h-full w-full object-contain" sessionId={null} /></div>)}
          </div>}
        </div>
        <div className="min-w-0 space-y-7">
          {GROUPS.map(group => (
            <section key={group.name}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">{group.name === "Curated sets" && <Layers className="h-5 w-5 text-accent" />}{group.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={group.name}>
                {STYLES.filter(s => group.ids.includes(s.id)).map(s => (
                  <Button key={s.id} variant="outline" disabled={busy || !!pendingSet} aria-pressed={s.id === styleId} onClick={() => selectStyle(s.id)}
                    className={`h-auto min-h-28 w-full items-start justify-start whitespace-normal rounded-lg p-4 text-left ${s.id === styleId ? "border-primary bg-secondary" : "border-border"}`}>
                    <div className="w-full min-w-0">
                      <div className="flex items-start justify-between gap-2"><span className="font-medium">{s.name}</span>{s.id === styleId && <Check className="mt-0.5 shrink-0 text-accent" />}</div>
                      <p className="mt-2 text-sm font-normal text-muted-foreground">{s.desc}</p>
                      <p className="mt-3 text-xs font-medium text-accent">{getVariationCount(s)} image{getVariationCount(s) > 1 ? "s" : ""} · {s.cost} token{s.cost > 1 ? "s" : ""}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </section>
          ))}
          <fieldset disabled={busy || !!pendingSet}>
            <legend className="mb-3 text-sm font-medium text-foreground">Intensity</legend>
            <div className="flex gap-2">{["subtle", "balanced", "bold"].map(i => <Button key={i} size="sm" aria-pressed={intensity === i} variant={intensity === i ? "default" : "outline"} onClick={() => selectStyle(style.id, i)} className="capitalize">{i}</Button>)}</div>
          </fieldset>
          {user && source && (pendingSet ? (
            <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={busy} onClick={retrySave}>{busy ? <Loader2 className="animate-spin" /> : null} Save completed set</Button>
          ) : balance < style.cost && !busy ? (
            <Button className="h-auto min-h-11 w-full whitespace-normal" onClick={() => openTopUp("insufficient")}>Not enough tokens — top up</Button>
          ) : (
            <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={busy || credits.isPending} onClick={run}>{busy ? <><Loader2 className="animate-spin" />Creating {progress} of {count}…</> : `Apply ${style.name} · ${style.cost} token${style.cost > 1 ? "s" : ""}`}</Button>
          ))}
        </div>
      </div>
      {!!variants.data?.length && <section className="mt-14">
        <h2 className="text-xl font-semibold text-foreground">Your styled images</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{variants.data.map(v => <div key={v.id} className="space-y-2">
          <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">{v.url && <ProtectedImage src={v.url} alt={getStyle(v.style)?.name ?? v.style} className="h-full w-full object-contain" filename={`styled-${v.id}.png`} sessionId={null} />}</div>
          <p className="text-sm text-muted-foreground">{getStyle(v.style)?.name ?? v.style}</p>
        </div>)}</div>
      </section>}

      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        email={user?.email}
        reason={topUpReason}
        requiredTokens={style.cost}
      />
    </div>
  );
}