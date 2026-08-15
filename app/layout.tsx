import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coastline — South West Coast Path Tracker",
  description: "Plan walking days, track your progress and explore elevation profiles on the South West Coast Path — even offline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Coastline", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#183f35",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
