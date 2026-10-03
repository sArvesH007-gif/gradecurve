import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GradeCurve", template: "%s · GradeCurve" },
  description:
    "Relative grading analytics and target projection for students and faculty.",
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
