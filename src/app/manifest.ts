import type { MetadataRoute } from "next";
import { iconUrl } from "@/lib/icon-version";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aline · Cricket shot analysis",
    short_name: "Aline",
    description: "Front-foot and back-foot defence analysis: confirm the shot, then measure it.",
    start_url: "/home",
    display: "standalone",
    orientation: "any",
    // The black field of today's design (the icons are drawn on it: scripts/brand-icons.mjs).
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["sports", "health", "education"],
    icons: [
      { src: iconUrl("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: iconUrl("/icon-512.png"), sizes: "512x512", type: "image/png" },
      { src: iconUrl("/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: iconUrl("/icon.svg"), sizes: "any", type: "image/svg+xml" },
    ],
  };
}
