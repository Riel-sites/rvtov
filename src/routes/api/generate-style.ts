import { createFileRoute } from "@tanstack/react-router";
import { getStyle } from "@/lib/styles";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const Route = createFileRoute("/api/generate-style")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveUserIdFromBearer, getTokenBalance } = await import("@/lib/monitoring.server");
        const userId = await resolveUserIdFromBearer(request.headers.get("authorization"));
        if (!userId) return new Response("Please sign in to add a style.", { status: 401 });
        const body = (await request.json()) as { sessionId?: string; style?: string; intensity?: string };
        const style = getStyle(body.style ?? "");
        if (!style || !body.sessionId) return new Response("Pick a style and an image.", { status: 400 });

        const balance = await getTokenBalance(userId);
        if (balance < style.cost) return new Response(`This style needs ${style.cost} token(s). Top up to continue.`, { status: 402 });

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: session } = await supabaseAdmin
          .from("try_on_sessions")
          .select("result_image_url, status, user_id")
          .eq("id", body.sessionId)
          .maybeSingle();
        if (!session || session.user_id !== userId || session.status !== "completed" || !session.result_image_url) {
          return new Response("Only your completed try-on images can be styled.", { status: 400 });
        }
        const { data: file, error } = await supabaseAdmin.storage.from("try-on-photos").download(session.result_image_url);
        if (error || !file) return new Response("Couldn't load the original image.", { status: 500 });
        const dataUrl = `data:${file.type || "image/png"};base64,${toBase64(await file.arrayBuffer())}`;

        const strength = body.intensity === "subtle" ? "subtly" : body.intensity === "bold" ? "boldly and fully" : "clearly";
        const instruction = `Re-render this image ${strength} in the style of ${style.prompt}. Preserve the person's identity, facial features, body shape, pose, clothing, accessories and the overall composition exactly. Change only the rendering, colour grading, lighting, texture and atmosphere. Output one image.`;

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            messages: [{ role: "user", content: [{ type: "text", text: instruction }, { type: "image_url", image_url: { url: dataUrl } }] }],
            modalities: ["image", "text"],
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          const msg = upstream.status === 429 ? "Busy right now, try again in a minute." : upstream.status === 402 ? "AI service credits exhausted." : text;
          return new Response(msg, { status: upstream.status });
        }
        return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      },
    },
  },
});
