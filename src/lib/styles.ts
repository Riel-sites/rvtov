/** Curated launch set of art styles (more can be added after testing). */
export const STYLES = [
  { id: "watercolor", name: "Watercolor", cost: 1, desc: "Soft washes, paper texture, loose brush edges.",
    prompt: "a delicate hand-painted watercolor illustration with soft pigment washes, visible paper grain and loose brush edges" },
  { id: "editorial", name: "Ultra-realistic editorial", cost: 1, desc: "Glossy magazine photo, crisp detail.",
    prompt: "an ultra-realistic high-end fashion editorial photograph with crisp detail, rich skin texture and professional studio colour grading" },
  { id: "game-cover", name: "Cinematic game cover", cost: 1, desc: "Bold illustrated action-cover look.",
    prompt: "a bold illustrated urban action video-game cover artwork style: thick clean outlines, saturated cinematic colours, dramatic sunset lighting and painterly comic shading (no logos or text)" },
  { id: "noir", name: "Film noir", cost: 1, desc: "Moody black & white, hard shadows.",
    prompt: "a moody black-and-white film noir still with hard dramatic shadows, high contrast and subtle film grain" },
  { id: "hd-portrait", name: "High-res editorial (HD)", cost: 2, desc: "Extra detail for saving and sharing.",
    prompt: "a very high-detail, high-resolution photorealistic fashion campaign image with enhanced fabric texture, sharp focus and refined lighting" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];
export const getStyle = (id: string) => STYLES.find((s) => s.id === id);
