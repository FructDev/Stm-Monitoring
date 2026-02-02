// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Girasol SCADA",
  description: "Sistema de Monitoreo Parque Solar Girasol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ELIMINADO EL COMENTARIO DE AQUÍ PARA EVITAR ERROR DE HIDRATACIÓN
    <html lang="es" className="dark">
      <body
        className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen`}
      >
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors expand={true} />
      </body>
    </html>
  );
}
