import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Header } from "@/components/agent/header";
import { Footer } from "@/components/agent/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ArquiRegula Chile · Agente de IA para Regularización de Edificaciones",
  description:
    "Agente de IA especializado en leyes y procesos de regularización de edificaciones en Chile (LGUC/OGUC). Combina RAG sobre normativa nacional y búsqueda web externa para generar documentación de manera eficiente.",
  keywords: [
    "regularización de obras",
    "LGUC",
    "OGUC",
    "DOM Chile",
    "agente IA",
    "RAG",
    "documentación de edificaciones",
    "permiso de edificación",
  ],
  authors: [{ name: "ArquiRegula Chile" }],
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50%' font-size='90' text-anchor='middle'>🏛️</text></svg>" },
  openGraph: {
    title: "ArquiRegula Chile",
    description: "Agente de IA para documentación de regularización de edificaciones en Chile.",
    siteName: "ArquiRegula Chile",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          <Footer />
        </div>
        <Toaster />
      </body>
    </html>
  );
}
