import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoseAI — 3D Human Pose Estimation",
  description: "Real-time 2D to 3D human pose estimation powered by deep learning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-dark-900 min-h-screen">{children}</body>
    </html>
  );
}
