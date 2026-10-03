import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Align — cricket shot analysis",
    short_name: "Align",
    description: "Front-foot defence analysis: confirm the shot, then measure it.",
    start_url: "/home",
    display: "standalone",
    orientation: "any",
    background_color: "#0d1f19",
    theme_color: "#0d1f19",
    categories: ["sports", "health", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
