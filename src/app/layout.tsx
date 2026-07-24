import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "CCV Dashboard Comercial",
  description:
    "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
  icons: {
    icon: "/logo-ccv.png",
    apple: "/logo-ccv.png",
  },
  openGraph: {
    title: "CCV Dashboard Comercial",
    description:
      "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CCV Dashboard Comercial",
    description:
      "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
