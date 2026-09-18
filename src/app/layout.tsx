import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles.css";
import { Providers } from "@/app/providers";
import { getCurrentSession } from "@/lib/actions/auth";
import { toUserProfile, type InitialAuth } from "@/lib/auth/client-session";

export const metadata: Metadata = {
  title: "CCV Dashboard Comercial",
  description:
    "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
  icons: {
    icon: "/Logo_CCV.png",
    apple: "/Logo_CCV.png",
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolver sesión en el servidor para hidratar AuthProvider sin flash
  // ("Usuario sin rol" / "Acceso restringido") en refresh / hard refresh.
  const session = await getCurrentSession();
  const initialAuth: InitialAuth | null = session
    ? {
        user: session.user,
        profile: toUserProfile(session.profile),
        role: session.role,
      }
    : null;

  return (
    <html lang="es" className="dark" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body>
        <Providers initialAuth={initialAuth}>{children}</Providers>
      </body>
    </html>
  );
}
