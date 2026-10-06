# Walkover — next-generation website

A full redesign of the walkover.in front-end: a product-studio experience with
scroll storytelling, interactive product showcases and a generative network hero.

## Stack

- **Next.js 16** (App Router, fully static output) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling (design tokens live in `src/app/globals.css`)
- **Framer Motion** for scroll-linked and micro-interactions
- **Lenis** for smooth scrolling
- No stock imagery: product visuals, blog covers and the hero are drawn in SVG / canvas

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # type-check
```

## Structure

```
src/
  content/site.ts          ← all copy & data (products, journey, values, roles, posts…)
  app/                     ← routes: /, /products, /about, /careers (+ sitemap, robots, icons)
  components/
    layout/                ← Nav, Footer, Logo, smooth-scroll + motion providers
    sections/              ← page sections (Hero, Products, Journey, Lab, Culture, …)
    ui/                    ← primitives: Button, Magnetic, SplitText, Reveal, Counter, TiltCard, Cursor
    visuals/               ← NetworkField (hero canvas), ProductVisual (per-product SVG scenes)
public/brand/              ← official Walkover logo
```

To change any text, product, milestone or job opening, edit `src/content/site.ts` only.

## Interaction highlights

| Section | Effect |
| --- | --- |
| Hero | Cursor-reactive particle network with travelling "packets", masked headline reveal, rotating verb, parallax-out on scroll, product marquee |
| What is Walkover | Scroll-scrubbed word-by-word statement, counters that animate into view |
| Products | Pinned horizontal scroll (desktop) / swipe carousel (touch); 3D tilt cards with spotlight, hover-expanding details, unique animated visual per product |
| Journey | Sticky storytelling timeline with a scroll-filled rail and a swapping year |
| Built for innovation | Expanding principle panels (accordion on mobile) |
| The Lab | Filterable, animated experiment grid with pointer-tracking glow |
| Culture | Values list with a cursor-following shape |
| Careers | Filterable openings with fill-sweep rows |
| Insights | Clip-path image reveals on generative editorial covers |
| Contact | Opposing parallax type, magnetic CTA |
| Global | Custom cursor (fine pointers only), magnetic buttons, page-transition curtain, hide-on-scroll nav, full-screen mobile menu |

## Performance & accessibility

- Every route is statically pre-rendered; the first load skips the transition curtain for a fast LCP.
- The canvas pauses when offscreen or in a background tab and caps device-pixel-ratio.
- Product loops only animate while visible.
- `prefers-reduced-motion` disables smooth scroll, canvas motion, pinned scrolling and CSS animations.
- Semantic landmarks, skip link, visible focus rings, ARIA state on filters / menu / accordions.
- Metadata, Open Graph, JSON-LD `Organization`, sitemap and robots are generated.

## Content sources & what to verify

walkover.in itself wasn't reachable from the build environment, so content was taken from
search-indexed pages of walkover.in and blog.walkover.in plus public profiles
(Crunchbase, LinkedIn, viaSocket's company profile, press coverage).
The logo comes from Walkover's official GitHub organisation avatar.

Items marked `// verify` in `src/content/site.ts` should be checked before launch:

- Team size (public sources range from 150+ to ~280)
- 50Agents and DocStar product URLs
- Year of the Socket → viaSocket transition
- Phone91's status
- Job openings are a snapshot from public listings; rows link to the live careers page
