import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Health Monitoring Portal",
    template: "%s · Health Monitoring Portal",
  },
  description:
    "Clinical and administrative portal for a wearable patient-monitoring system.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17191C",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
