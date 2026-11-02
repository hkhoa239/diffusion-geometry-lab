import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diffusion Geometry Lab",
  description: "Học mô hình khuếch tán và hình học thông tin qua trực quan hoá tương tác.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
