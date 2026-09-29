import type { Metadata, Viewport } from "next";
import { appPath } from "@/lib/app-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "Documentos | Labruna",
  description: "Procesamiento y revisión de remitos, chapas y cheques.",
  icons: { icon: appPath("/favicon.svg") },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11233f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
