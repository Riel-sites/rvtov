import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";

type ImageFrame = { dataUrl: string; final: boolean };

function extractBase64(payload: unknown): { b64: string; final: boolean } | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const type = typeof obj["type"] === "string" ? (obj["type"] as string) : "";

  if (typeof obj["b64_json"] === "string") {
    return { b64: obj["b64_json"] as string, final: !type.includes("partial") };
  }
  const data = obj["data"];
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (first && typeof first["b64_json"] === "string") {
      return { b64: first["b64_json"] as string, final: !type.includes("partial") };
    }
  }
  return null;
}

/** POSTs a prompt to a streaming image route and yields partial + final frames. */
export async function streamImage(
  endpoint: string,
  body: Record<string, unknown>,
  onFrame: (frame: ImageFrame) => void,
): Promise<string | null> {
  // Attach the session token so server-side monitoring can attribute the run.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers["Authorization"] = `Bearer ${data.session.access_token}`;
  } catch {
    // unauthenticated runs are still allowed
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || "Image generation failed");
  }

  let lastFinal: string | null = null;
  const parser = createParser({
    onEvent(event) {
      if (!event.data || event.data === "[DONE]") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const found = extractBase64(payload);
      if (!found) return;
      const dataUrl = `data:image/png;base64,${found.b64}`;
      if (found.final) lastFinal = dataUrl;
      onFrame({ dataUrl, final: found.final });
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  return lastFinal;
}
