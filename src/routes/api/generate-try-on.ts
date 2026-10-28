import { createFileRoute } from "@tanstack/react-router";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

const LIGHTING_NOTE =
  "Relight the person and the garment so the lighting matches the final background exactly: same light direction, intensity, softness, colour temperature and white balance, with consistent shadows, contact shadows on the ground, highlights and ambient colour bounce from the scene. No mismatched exposure, no cut-out or pasted-in look, seamless edge blending.";

const FULL_BODY_NOTE =
  "If the garment is a full-body or full-length item (full outfit, dress, gown, jumpsuit, suit, coat, trousers, skirt, or anything covering below the waist) but the subject photo is cropped (headshot, half-body, or waist-up), extend the frame and plausibly generate the person's missing lower body, legs, footwear and full stance so the entire garment is visible head-to-toe, keeping the same identity, body type, skin tone, camera angle, perspective and background style, and extending the background naturally to fill the wider frame.";

const IDENTITY_NOTE =
  "Keep the person's face, identity, body proportions, skin tone, hair and background unchanged.";

const POSE_NOTES: Record<string, string> = {
  keep: "Keep the person's original pose and stance from the source photo unchanged.",
  standing:
    "Pose the person standing straight and relaxed, facing the camera front-on, arms loose at their sides, framed head-to-toe.",
  walking:
    "Pose the person mid-stride in a natural runway walk, one leg forward with visible motion in the fabric, framed head-to-toe.",
  "three-quarter":
    "Pose the person in a three-quarter turn, body angled roughly 45 degrees from the camera with the head turned toward the lens, framed head-to-toe.",
  side: "Pose the person in a full side profile so the silhouette of the outfit is clearly visible, framed head-to-toe.",
  back: "Pose the person facing away from the camera so the back of the outfit is fully visible, framed head-to-toe.",
  sitting:
    "Pose the person seated naturally on a simple stool, back straight, the garment draping realistically, full body in frame.",
  "hands-hips":
    "Pose the person standing confidently with hands on hips, shoulders square to the camera, framed head-to-toe.",
  leaning:
    "Pose the person casually leaning against a plain wall, weight on one leg, relaxed shoulders, framed head-to-toe.",
};

function poseNote(pose: string | undefined, hasSubject: boolean): string {
  const key = pose && pose in POSE_NOTES ? pose : hasSubject ? "keep" : "standing";
  return POSE_NOTES[key]!;
}

const BACKGROUND_SCENES: Record<string, string> = {
  "studio-white": "a clean, seamless white photography studio backdrop with soft even lighting",
  "studio-grey": "a neutral mid-grey editorial studio backdrop with soft directional lighting",
  runway: "a fashion show runway with a dark audience area and bright overhead spotlights",
  "city-street": "a stylish urban city street with blurred storefronts and natural daylight",
  beach: "a sandy beach shoreline at golden hour with warm low sunlight and soft sea haze",
  garden: "a lush green garden with flowering plants in bright natural daylight",
  loft: "a sunlit minimal loft interior with large windows and warm wooden floors",
  "night-city": "a night-time city scene with neon signage and colourful bokeh city lights",
};

/** Background instruction for the chosen scene (or the shopper's own description). */
function backgroundNote(
  background: string | undefined,
  custom: string | undefined,
  hasSubject: boolean,
): string {
  const described = typeof custom === "string" ? custom.trim() : "";
  if (background === "custom" && described) {
    return `Replace the background entirely with this described scene: ${described}. Integrate the person naturally into it with correct perspective, scale, ground contact and depth of field.`;
  }
  const scene = background ? BACKGROUND_SCENES[background] : undefined;
  if (scene) {
    return `Replace the background entirely with ${scene}. Integrate the person naturally into it with correct perspective, scale, ground contact and depth of field.`;
  }
  return hasSubject
    ? "Keep the background from the source photo unchanged."
    : "Place the model on a clean, seamless studio backdrop with soft even lighting.";
}

type Usage = Partial<Record<"prompt_tokens" | "completion_tokens" | "total_tokens" | "input_tokens" | "output_tokens", number>>;

/** Wraps the upstream SSE stream so completion/failure and latency are recorded. */
function instrumentStream(
  upstreamBody: ReadableStream<Uint8Array>,
  onFinish: (outcome: { ok: boolean; error?: string; usage?: Usage }) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let sawError: string | null = null;
  const usage: Usage = {};
  let finished = false;
  const finish = (outcome: { ok: boolean; error?: string; usage?: Usage }) => {
    if (finished) return;
    finished = true;
    onFinish(outcome);
  };
  // `cancel` is supported at runtime but missing from the TS lib typings.
  const transformer: Transformer<Uint8Array, Uint8Array> & { cancel?: (reason: unknown) => void } = {
    transform(chunk, controller) {
      // Cheap scan for gateway error events / token usage without fully parsing SSE.
      const text = decoder.decode(chunk, { stream: true });
      for (const k of ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"] as const) {
        const m = text.match(new RegExp(`"${k}"\\s*:\\s*(\\d+)`));
        if (m) usage[k] = Number(m[1]);
      }
      if (!sawError) {
        if (text.includes('"error"')) {
          const m = text.match(/"message"\s*:\s*"([^"]{0,200})/);
          sawError = m?.[1] ?? "gateway error event";
        }
      }
      controller.enqueue(chunk);
    },
    flush() {
      finish(sawError ? { ok: false, error: sawError } : { ok: true, usage });
    },
    cancel(reason) {
      finish({ ok: false, error: `stream cancelled: ${String(reason ?? "client aborted")}` });
    },
  };
  return upstreamBody.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(transformer));
}

export const Route = createFileRoute("/api/generate-try-on")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const {
          logMonitoringEvent,
          resolveUserIdFromBearer,
          classifyUpstreamError,
          getTokenBalance,
          estimateCostUsd,
        } = await import(
          "@/lib/monitoring.server"
        );
        const userId = await resolveUserIdFromBearer(request.headers.get("authorization"));
        const body = (await request.json()) as {
          prompt?: string;
          photoDataUrl?: string;
          garmentDataUrl?: string;
          pose?: string;
          background?: string;
          backgroundPrompt?: string;
        };
        const { prompt, photoDataUrl, garmentDataUrl, pose, background, backgroundPrompt } = body;

        const hasPrompt = typeof prompt === "string" && prompt.trim().length > 0;
        const hasPhoto = typeof photoDataUrl === "string" && photoDataUrl.startsWith("data:");
        const hasGarment = typeof garmentDataUrl === "string" && garmentDataUrl.startsWith("data:");

        const mode =
          hasPhoto && hasGarment
            ? "subject+garment"
            : hasPhoto
              ? "subject+text"
              : hasGarment
                ? "garment-only"
                : "text-only";
        const model = hasPhoto || hasGarment ? "google/gemini-3-pro-image" : "openai/gpt-image-2";
        const baseEvent = {
          user_id: userId,
          route: "/api/generate-try-on",
          mode,
          model,
          detail: { pose: pose ?? null, background: background ?? null },
        };
        const fail = (error_code: string, error_message: string, status?: number) =>
          logMonitoringEvent({
            ...baseEvent,
            event_type: "tryon_failed",
            status: status != null ? String(status) : "failed",
            error_code,
            error_message,
            duration_ms: Date.now() - startedAt,
          });
        const onStreamFinish = (outcome: { ok: boolean; error?: string; usage?: Usage }) => {
          if (!outcome.ok) {
            void fail("stream_error", outcome.error ?? "stream error");
            return;
          }
          const u = outcome.usage ?? {};
          const promptTokens = u.prompt_tokens ?? u.input_tokens ?? null;
          const completionTokens = u.completion_tokens ?? u.output_tokens ?? null;
          const totalTokens =
            u.total_tokens ?? (promptTokens != null || completionTokens != null ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);
          void (async () => {
            // Token is deducted when the result is saved (saveTryOnResult).
            await logMonitoringEvent({
              ...baseEvent,
              event_type: "tryon_succeeded",
              status: "ok",
              duration_ms: Date.now() - startedAt,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              cost_usd: estimateCostUsd(model, promptTokens, completionTokens),
            });
          })();
        };

        if (!hasPrompt && !hasGarment) {
          void fail("bad_request", "Missing prompt", 400);
          return new Response("Missing prompt", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          void fail("misconfigured", "Missing LOVABLE_API_KEY", 500);
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        if (!userId) {
          void fail("unauthenticated", "Sign in required", 401);
          return new Response("Please sign in to generate a try-on.", { status: 401 });
        }
        const balance = await getTokenBalance(userId);
        if (balance < 1) {
          void fail("no_tokens", "Insufficient tokens", 402);
          return new Response("You're out of try-on tokens. Ask an admin for more.", { status: 402 });
        }

        void logMonitoringEvent({ ...baseEvent, event_type: "tryon_started", status: "started" });

        const POSE_NOTE = poseNote(pose, hasPhoto);
        const BACKGROUND_NOTE = backgroundNote(background, backgroundPrompt, hasPhoto);
        const customBackground =
          (background === "custom" && (backgroundPrompt ?? "").trim().length > 0) ||
          (!!background && background in BACKGROUND_SCENES);
        // When a new scene is requested the background must change, so drop the
        // "background unchanged" clause from the identity instruction.
        const identity = customBackground
          ? "Keep the person's face, identity, body proportions, skin tone and hair unchanged."
          : IDENTITY_NOTE;

        const productDescription = hasPrompt
          ? prompt!.trim()
          : "the custom clothing item supplied by the shopper";


        let instruction: string | null = null;
        const images: string[] = [];

        if (hasPhoto && hasGarment) {
          // Subject photo + custom garment: compose both uploads.
          instruction = `Virtual try-on: dress the person in the first photo in the exact garment shown in the second photo. ${identity} Match the garment's silhouette, color, fabric texture, pattern, and details as closely as possible. Pose: ${POSE_NOTE} Background: ${BACKGROUND_NOTE} ${FULL_BODY_NOTE} ${LIGHTING_NOTE} Product description for reference: ${productDescription}. Output a single realistic, photographically consistent fashion photograph.`;
          images.push(photoDataUrl!, garmentDataUrl!);
        } else if (hasPhoto) {
          // AI dress generator: the described garment is rendered onto the
          // shopper's own uploaded photo (the subject image must be used).
          instruction = `Virtual try-on: dress the person in the provided photo in the following garment, generated from this description: ${productDescription}. ${identity} Render the garment realistically on their body with accurate fit, drape, fabric texture and natural wrinkles. Pose: ${POSE_NOTE} Background: ${BACKGROUND_NOTE} ${FULL_BODY_NOTE} ${LIGHTING_NOTE} Output a single realistic, photographically consistent fashion photograph of this same person wearing the garment.`;
          images.push(photoDataUrl!);
        } else if (hasGarment) {
          // Clothes-only: invent a plausible subject wearing the uploaded item.
          instruction = `Generate a realistic full-body fashion photograph of a model wearing the exact garment shown in the provided image. Reproduce the garment's silhouette, colour, fabric texture, pattern and details faithfully. Create a natural, believable person to wear it: realistic proportions, framed head-to-toe with footwear so the whole garment is visible. Pose: ${POSE_NOTE} Background: ${BACKGROUND_NOTE} ${LIGHTING_NOTE} Product description for reference: ${productDescription}. Output a single photorealistic image.`;
        }


        if (instruction) {
          const userContent: ContentPart[] = [{ type: "text", text: instruction }];
          for (const url of images.length > 0 ? images : [garmentDataUrl!]) {
            userContent.push({ type: "image_url", image_url: { url } });
          }

          const upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/images/generations",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-pro-image",
                messages: [{ role: "user", content: userContent }],
                modalities: ["image", "text"],
                stream: true,
              }),
            },
          );

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text();
            const c = classifyUpstreamError(upstream.status, text);
            void fail(c.code, c.message, upstream.status);
            return new Response(text, { status: upstream.status });
          }

          return new Response(instrumentStream(upstream.body, onStreamFinish), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        }

        // Text-only: no uploads at all, render the product on a generated model.
        const fullPrompt = `Virtual try-on product preview: ${productDescription}. Show the item on a realistic model, framed head-to-toe if the item is full-length. Pose: ${POSE_NOTE} Background: ${BACKGROUND_NOTE} ${LIGHTING_NOTE}`;

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-image-2",
              prompt: fullPrompt,
              quality: "low",
              size: "1024x1024",
              n: 1,
              stream: true,
              partial_images: 1,
            }),
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          const c = classifyUpstreamError(upstream.status, text);
          void fail(c.code, c.message, upstream.status);
          return new Response(text, { status: upstream.status });
        }

        return new Response(instrumentStream(upstream.body, onStreamFinish), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
