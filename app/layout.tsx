import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NidusLab — Meet Nidus, your AI companion",
  description: "An interactive 3D AI companion living right inside the website.",
};

export const viewport: Viewport = { themeColor: "#ecfdf5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
