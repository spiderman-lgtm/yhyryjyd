import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Nav } from "@/components/layout/Nav";
import { Providers } from "@/components/layout/Providers";
import { company, products } from "@/content/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(company.urls.site),
  title: {
    default: "Walkover — We build products",
    template: "%s · Walkover",
  },
  description: company.description,
  keywords: ["Walkover", "MSG91", "viaSocket", "GTWY AI", "Giddh", "50Agents", "DocStar", "Indore", "product company", "AI", "automation", "communication"],
  openGraph: {
    type: "website",
    siteName: "Walkover",
    title: "Walkover — We build products",
    description: company.description,
    url: company.urls.site,
    images: [{ url: "/brand/walkover-logo.png", width: 400, height: 400, alt: "Walkover" }],
  },
  twitter: { card: "summary_large_image", title: "Walkover — We build products", description: company.description },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: company.name,
  legalName: company.legalName,
  url: company.urls.site,
  logo: `${company.urls.site}/brand/walkover-logo.png`,
  foundingDate: String(company.founded),
  founders: company.founders.map((name) => ({ "@type": "Person", name })),
  address: {
    "@type": "PostalAddress",
    streetAddress: company.address.lines.slice(0, 2).join(", "),
    addressLocality: "Indore",
    addressRegion: "Madhya Pradesh",
    postalCode: "452011",
    addressCountry: "IN",
  },
  sameAs: company.socials.map((s) => s.href),
  brand: products.map((p) => ({ "@type": "Brand", name: p.name, url: p.url })),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable} ${jetbrains.variable}`}>
      <body className="grain">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Providers>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
