import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Hand lettering for the lesson illustrations.
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap", weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Aline — cricket shot analysis", template: "%s · Aline" },
  description:
    "Shot analysis for cricket: the front-foot and the back-foot defence. Reconstruct body, bat and ball, confirm the shot before grading it, then train one measurable priority.",
  applicationName: "Aline",
  appleWebApp: { capable: true, title: "Aline", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies a saved light/dark choice before first paint (no flash). Default: follow the device.
const themeScript = `try{var t=localStorage.getItem("align.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
