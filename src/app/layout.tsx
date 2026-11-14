import type { Metadata, Viewport } from "next";
import { Archivo, Geist } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Display: wide and heavy, for headlines and big numbers (the second design, docs/13).
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", axes: ["wdth"] });

export const metadata: Metadata = {
  title: { default: "Aline — cricket shot analysis", template: "%s · Aline" },
  description:
    "Shot analysis for cricket: the front-foot and the back-foot defence. Reconstruct body, bat and ball, confirm the shot before grading it, then train one measurable priority.",
  applicationName: "Aline",
  appleWebApp: { capable: true, title: "Aline", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
  // Which build this page is (the version watch compares it with the live one).
  other: { "aline-build": process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#050505" },
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies a saved light/dark choice before first paint (no flash). Default: follow the device.
const themeScript = `try{var t=localStorage.getItem("align.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-ui={process.env.NEXT_PUBLIC_UI === "1" ? undefined : "2"} className={`${geist.variable} ${archivo.variable}`} suppressHydrationWarning>
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
