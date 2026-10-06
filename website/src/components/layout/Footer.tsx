import Link from "next/link";
import { company, nav, products } from "@/content/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-ink">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-mute">
            {company.tagline}. Building products from {company.city}, India, since {company.founded}.
          </p>
        </div>
        <FooterCol title="Products" className="md:col-span-3">
          {products.map((p) => (
            <li key={p.slug}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 hover:text-paper">
                <span className="h-1.5 w-1.5 rounded-full transition-transform group-hover:scale-150" style={{ background: p.color }} />
                {p.name}
              </a>
            </li>
          ))}
        </FooterCol>
        <FooterCol title="Company" className="md:col-span-2">
          {nav.slice(1).map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="hover:text-paper">
                {n.label}
              </Link>
            </li>
          ))}
        </FooterCol>
        <FooterCol title="Elsewhere" className="md:col-span-3">
          {company.socials.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-paper">
                {s.label} ↗
              </a>
            </li>
          ))}
        </FooterCol>
      </div>
      <div className="container-x flex flex-col gap-2 border-t border-line py-6 text-xs text-dim sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {company.legalName}
        </p>
        <p>Made with intent in Indore.</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="label mb-4">{title}</p>
      <ul className="space-y-2.5 text-sm text-paper/70">{children}</ul>
    </div>
  );
}
