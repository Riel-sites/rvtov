import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Upload, Sparkles, ImageIcon, Loader2, Check, AlertCircle, Shirt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { getMyCredits } from "@/lib/credits.functions";
import { PricingPacks } from "@/components/PricingPacks";
import { ProtectedImage } from "@/components/ProtectedImage";
import { streamImage } from "@/lib/streamImage";
import {
  uploadTryOnPhoto,
  saveTryOnResult,
  markTryOnFailed,
  getTryOnSessions,
} from "@/lib/tryon.functions";

export const Route = createFileRoute("/try-on")({
  validateSearch: z.object({
    productId: z.string().uuid().optional(),
    prompt: z.string().max(500).optional(),
  }),
  head: () => ({
    meta: [
      { title: "AI Try-On Studio — Virtual Try-On" },
      {
        name: "description",
        content:
          "Upload a photo and generate a realistic AI try-on preview. Your photos are stored privately in your account.",
      },
      { property: "og:title", content: "AI Try-On Studio — Virtual Try-On" },
      {
        property: "og:description",
        content: "Upload a photo and generate a realistic AI try-on preview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TryOnPage,
});

type Phase = "idle" | "uploading" | "generating" | "saving" | "done" | "error";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "uploading", label: "Saving your photo" },
  { phase: "generating", label: "Rendering the try-on" },
  { phase: "saving", label: "Storing your result" },
];

const PHASE_ORDER: Phase[] = ["idle", "uploading", "generating", "saving", "done"];

const POSES = [
  { id: "keep", label: "Keep my pose", hint: "Preserve the stance from your photo" },
  { id: "standing", label: "Standing straight", hint: "Relaxed front-facing full-body stance" },
  { id: "walking", label: "Walking", hint: "Mid-stride runway walk" },
  { id: "three-quarter", label: "Three-quarter turn", hint: "Body angled, head to camera" },
  { id: "side", label: "Side profile", hint: "Full profile view of the outfit" },
  { id: "back", label: "Back view", hint: "Facing away to show the back" },
  { id: "sitting", label: "Seated", hint: "Sitting naturally on a stool" },
  { id: "hands-hips", label: "Hands on hips", hint: "Confident editorial pose" },
  { id: "leaning", label: "Leaning", hint: "Casual lean against a wall" },
] as const;

type PoseId = (typeof POSES)[number]["id"];

const BACKGROUNDS = [
  { id: "keep", label: "Keep original", hint: "Preserve the background from your photo" },
  { id: "studio-white", label: "White studio", hint: "Clean seamless white studio backdrop" },
  { id: "studio-grey", label: "Grey studio", hint: "Neutral grey editorial backdrop" },
  { id: "runway", label: "Runway", hint: "Fashion show runway with soft spotlights" },
  { id: "city-street", label: "City street", hint: "Urban street style setting" },
  { id: "beach", label: "Beach", hint: "Golden-hour sandy shoreline" },
  { id: "garden", label: "Garden", hint: "Lush green garden in daylight" },
  { id: "loft", label: "Loft interior", hint: "Sunlit minimal loft with big windows" },
  { id: "night-city", label: "Night city", hint: "Neon-lit city at night" },
  { id: "custom", label: "Describe my own", hint: "Write any background you like" },
] as const;

type BackgroundId = (typeof BACKGROUNDS)[number]["id"];


function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("We couldn't read that file. Try a different image."));
    reader.readAsDataURL(file);
  });
}

/** Turns raw upstream/network errors into something a shopper can act on. */
function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.toLowerCase();

  if (!text || text === "undefined") return "Something went wrong. Please try again.";
  if (text.includes("failed to fetch") || text.includes("networkerror"))
    return "Connection lost while generating. Check your internet and try again.";
  if (text.includes("429") || text.includes("rate limit"))
    return "The try-on studio is busy right now. Give it a moment and try again.";
  if (text.includes("out of try-on tokens"))
    return "You're out of try-on tokens. Ask an admin to top up your balance.";
  if (text.includes("402") || text.includes("credit") || text.includes("quota"))
    return "AI credits have run out for this workspace. Top up to keep generating try-ons.";
  if (text.includes("larger than") || text.includes("too large") || text.includes("413"))
    return "That photo is too large. Please upload an image under 8MB.";
  if (text.includes("unsupported image") || text.includes("format"))
    return "That image format isn't supported. Use a PNG, JPEG, or WEBP photo.";
  if (text.includes("unauthorized") || text.includes("401") || text.includes("jwt"))
    return "Your session expired. Please sign in again to continue.";
  if (text.includes("safety") || text.includes("policy") || text.includes("moderation"))
    return "That request was blocked by the content filter. Try a different photo or description.";
  if (text.includes("no image"))
    return "The model didn't return an image. Try rewording your product description.";
  if (text.includes("timed out") || text.includes("timeout"))
    return "The generation took too long and timed out. Please try again.";
  return "We couldn't finish the try-on. Please try again.";
}

function TryOnPage() {
  const { productId, prompt: presetPrompt } = Route.useSearch();
  const { user, isLoading } = useAuth();
  const [showTopUp, setShowTopUp] = useState(false);
  useEffect(() => {
    if (window.location.hash === "#topup") setShowTopUp(true);
  }, []);

  const uploadPhoto = useServerFn(uploadTryOnPhoto);
  const saveResult = useServerFn(saveTryOnResult);
  const failSession = useServerFn(markTryOnFailed);
  const listSessions = useServerFn(getTryOnSessions);
  const fetchCredits = useServerFn(getMyCredits);
  const credits = useQuery({
    queryKey: ["my-credits"],
    queryFn: () => fetchCredits(),
    enabled: !!user,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [garmentDataUrl, setGarmentDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(presetPrompt ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSessionId, setResultSessionId] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [pose, setPose] = useState<PoseId>("keep");
  const [background, setBackground] = useState<BackgroundId>("keep");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");



  const isBusy = phase === "uploading" || phase === "generating" || phase === "saving";

  // Elapsed-time ticker + a slow creep so the bar always feels alive between
  // the discrete milestones the stream gives us.
  useEffect(() => {
    if (!isBusy) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - started) / 1000));
      setProgress((current) => (current < 92 ? current + 1 : current));
    }, 700);
    return () => window.clearInterval(id);
  }, [isBusy]);

  async function handleFile(file: File) {
    setError(null);
    setResultUrl(null);
    setIsFinal(false);
    setPhase("idle");
    setProgress(0);
    if (file.size > 8 * 1024 * 1024) {
      const message = "That photo is too large. Please upload an image under 8MB.";
      setError(message);
      toast.error(message);
      return;
    }
    try {
      setPhotoDataUrl(await readAsDataUrl(file));
      toast.success("Photo ready", { description: "Describe the product, then generate." });
    } catch (e) {
      const message = friendlyError(e);
      setError(message);
      toast.error(message);
    }
  }

  async function handleGarmentFile(file: File) {
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      const message = "That clothing image is too large. Please upload an image under 8MB.";
      setError(message);
      toast.error(message);
      return;
    }
    try {
      setGarmentDataUrl(await readAsDataUrl(file));
      toast.success("Custom item ready", {
        description: "We'll match its shape, colour and fabric in your try-on.",
      });
    } catch (e) {
      const message = friendlyError(e);
      setError(message);
      toast.error(message);
    }
  }

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();
    if (!photoDataUrl && !garmentDataUrl) {
      const message =
        "Upload your photo, or upload just a clothing item and we'll generate a model wearing it.";
      setError(message);
      toast.error(message);
      return;
    }
    if (photoDataUrl && !trimmedPrompt && !garmentDataUrl) {
      const message = "Describe the product or upload your own clothing item.";
      setError(message);
      toast.error(message);
      return;
    }
    setError(null);
    setIsFinal(false);
    setResultUrl(null);
    setElapsed(0);
    setProgress(6);
    setPhase("uploading");
    let sessionId: string | null = null;

    try {
      const uploaded = await uploadPhoto({
        data: {
          // With no subject photo we store the garment as the session source.
          dataUrl: photoDataUrl ?? garmentDataUrl!,
          productId,
          prompt: trimmedPrompt || "Custom clothing item uploaded by shopper",
        },
      });
      sessionId = uploaded.sessionId;

      setPhase("generating");
      setProgress((current) => Math.max(current, 25));

      const finalDataUrl = await streamImage(
        "/api/generate-try-on",
        {
          prompt: trimmedPrompt,
          photoDataUrl,
          garmentDataUrl,
          pose,
          background,
          backgroundPrompt: backgroundPrompt.trim(),
        },


        (frame) => {
          setResultUrl(frame.dataUrl);
          setIsFinal(frame.final);
          setProgress((current) => Math.max(current, frame.final ? 90 : 60));
        },
      );

      if (!finalDataUrl) throw new Error("No image was returned.");

      setPhase("saving");
      setProgress((current) => Math.max(current, 94));
      const saved = await saveResult({ data: { sessionId, dataUrl: finalDataUrl } });
      setResultUrl(saved.signedUrl);
      setResultSessionId(sessionId);
      setIsFinal(true);
      setProgress(100);
      setPhase("done");
      toast.success("Try-on ready", { description: "Saved to your try-on history." });
      void sessions.refetch();
      setTimeout(() => void credits.refetch(), 1500);
    } catch (e) {
      if (sessionId) {
        try {
          await failSession({ data: { sessionId } });
        } catch {
          /* the session stays pending; not worth surfacing */
        }
      }
      const message = friendlyError(e);
      setError(message);
      setPhase("error");
      setProgress(0);
      toast.error("Try-on failed", { description: message });
    }
  }

  const sessions = useQuery({
    queryKey: ["try-on-sessions"],
    queryFn: () => listSessions({}),
    enabled: !!user,
  });

  if (!isLoading && !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Try-On Studio</h1>
        <p className="mt-4 text-muted-foreground">
          Sign in to upload a photo — your images are stored privately in your account.
        </p>
        <Button asChild className="mt-8" size="lg">
          <Link to="/auth">Sign in to continue</Link>
        </Button>
      </div>
    );
  }

  const activeIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          AI Try-On Studio
        </h1>
        {credits.data && (
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                credits.data.balance > 0
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {credits.data.balance} {credits.data.balance === 1 ? "token" : "tokens"} left
            </span>
            <Button size="sm" onClick={() => setShowTopUp((v) => !v)}>
              {showTopUp ? "Hide packs" : "Top up"}
            </Button>
          </div>
        )}
      </div>
      {credits.data && (showTopUp || credits.data.balance < 3) && (
        <div id="topup" className="mt-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-6">
          <p className={`mb-5 text-sm font-medium ${credits.data.balance < 1 ? "text-destructive" : "text-foreground"}`}>
            {credits.data.balance < 1
              ? "You've used all your try-on tokens. Pick a pack below to keep generating."
              : credits.data.balance < 3
                ? "You're running low on tokens. Top up anytime:"
                : "Buy more tokens:"}
          </p>
          <PricingPacks email={user?.email} compact />
        </div>
      )}
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Upload your photo, a clothing item, or both — we'll render the try-on. With just a garment we
        generate a model wearing it. Photos and results are saved privately to your account.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <Label htmlFor="photo">Your photo (optional if you upload a clothing item)</Label>

            <input
              ref={inputRef}
              id="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              className="mx-auto mt-2 flex aspect-[4/5] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted transition-colors hover:border-accent disabled:opacity-60"
            >
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Your uploaded photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Upload className="h-6 w-6" />
                  PNG, JPEG or WEBP — up to 8MB
                </span>
              )}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="garment">Your own clothing item (optional)</Label>
              {garmentDataUrl && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setGarmentDataUrl(null)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  <X className="h-3 w-3" />
                  Remove
                </button>
              )}
            </div>
            <input
              ref={garmentInputRef}
              id="garment"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleGarmentFile(file);
              }}
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => garmentInputRef.current?.click()}
              className="mt-2 flex w-full items-center gap-4 rounded-2xl border border-dashed border-border bg-muted p-4 text-left transition-colors hover:border-accent disabled:opacity-60"
            >
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                {garmentDataUrl ? (
                  <img
                    src={garmentDataUrl}
                    alt="Your custom clothing item"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Shirt className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                {garmentDataUrl
                  ? "Custom item added — we'll match it in your try-on."
                  : "Upload a garment you own. With no photo of you, we'll generate a model wearing it."}
              </span>
            </button>
            {photoDataUrl && garmentDataUrl && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-accent">
                <Sparkles className="h-3 w-3" />
                Both images uploaded — the result will be based on your photo and this garment.
              </p>
            )}

          </div>

          <div>
            <Label>Pose</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose the stance for the generated full-body try-on.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {POSES.map((option) => {
                const selected = pose === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={selected}
                    title={option.hint}
                    onClick={() => setPose(option.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-muted text-muted-foreground hover:border-accent"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {POSES.find((option) => option.id === pose)?.hint}
            </p>
          </div>

          <div>
            <Label>Background</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a scene, or describe your own — the subject and garment are relit to match.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BACKGROUNDS.map((option) => {
                const selected = background === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={selected}
                    title={option.hint}
                    onClick={() => setBackground(option.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-muted text-muted-foreground hover:border-accent"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {BACKGROUNDS.find((option) => option.id === background)?.hint}
            </p>
            {background === "custom" && (
              <Textarea
                id="background-prompt"
                value={backgroundPrompt}
                disabled={isBusy}
                onChange={(e) => setBackgroundPrompt(e.target.value)}
                placeholder="e.g. a marble palace staircase at dusk with warm candlelight"
                className="mt-3 min-h-20"
              />
            )}
          </div>






          <div>
            <Label htmlFor="prompt">Product description</Label>
            <Textarea
              id="prompt"
              value={prompt}
              disabled={isBusy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a tailored ivory linen blazer with gold buttons"
              className="mt-2 min-h-24"
            />
          </div>

          <Button size="lg" onClick={handleGenerate} disabled={isBusy}>
            {isBusy ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-5 w-5" />
            )}
            {isBusy ? "Working…" : phase === "done" ? "Generate again" : "Generate try-on"}
          </Button>

          {(isBusy || phase === "done") && (
            <div
              aria-live="polite"
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {phase === "done" ? "Try-on complete" : "Creating your try-on"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {phase === "done" ? "100%" : `${Math.min(progress, 99)}% · ${elapsed}s`}
                </span>
              </div>
              <Progress value={phase === "done" ? 100 : progress} className="mt-3" />
              <ul className="mt-4 space-y-2">
                {STEPS.map((step) => {
                  const stepIndex = PHASE_ORDER.indexOf(step.phase);
                  const isActive = phase === step.phase;
                  const isComplete = phase === "done" || activeIndex > stepIndex;
                  return (
                    <li key={step.phase} className="flex items-center gap-2 text-sm">
                      {isComplete ? (
                        <Check className="h-4 w-4 text-accent" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-border" />
                      )}
                      <span
                        className={
                          isActive || isComplete ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {phase === "generating" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  This usually takes 15–40 seconds. You'll see a preview as it sharpens.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="text-sm text-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={handleGenerate} disabled={isBusy}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label>Result</Label>
          <div className="relative mt-2 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
            {resultUrl ? (
              <ProtectedImage
                src={resultUrl}
                alt="AI generated try-on result"
                sessionId={isFinal ? resultSessionId : null}
                className={`h-full w-full object-cover transition-[filter] duration-500 ${isFinal ? "blur-0" : "blur-2xl"}`}
              />
            ) : isBusy ? (
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                Warming up the studio…
              </div>
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                Your try-on will appear here
              </span>
            )}
            {resultUrl && !isFinal && (
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
                Sharpening preview…
              </span>
            )}
          </div>
        </div>
      </div>

      {sessions.data && sessions.data.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold text-foreground">Your try-on history</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {sessions.data.map((session) => (
              <div key={session.id} className="space-y-2">
                <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
                  {session.resultUrl || session.originalUrl ? (
                    <ProtectedImage
                      src={session.resultUrl ?? session.originalUrl ?? ""}
                      alt={session.prompt ?? "Try-on session"}
                      className="h-full w-full object-cover"
                      filename={`try-on-${session.id}.png`}
                      sessionId={session.resultUrl ? session.id : null}
                    />
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {session.prompt ?? session.status}
                </p>
                {session.status === "completed" && session.resultUrl && (
                  <Link to="/styles" search={{ session: session.id }} className="text-xs font-medium text-primary underline">
                    Add style
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
