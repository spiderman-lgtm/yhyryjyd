import { Reveal, Stagger, StaggerItem } from '@/components/Motion';

export const metadata = {
  title: 'DealRadar browser extension — price history on every store',
  description: 'See price history, a Deal Score and cheaper prices on Amazon, Flipkart, Myntra, Zepto, Blinkit, Instamart, BigBasket and JioMart right on the product page.',
};

const FEATURES = [
  { t: 'Price history on the product page', d: 'A DealRadar panel appears on Amazon, Flipkart, Myntra and 8 more stores with the price graph and lows.' },
  { t: 'Buy or Skip, instantly', d: 'The Deal Score flags fake sales — prices raised just before a “discount” — and inflated prices.' },
  { t: 'Cheaper on another store?', d: 'Compares Amazon, Flipkart, Myntra, Croma, Reliance Digital, Tata CLiQ and more, cheapest first.' },
  { t: 'Zepto, Blinkit, Instamart, BigBasket & JioMart', d: 'One tap checks quick-commerce prices and availability at the delivery location you already use on those apps.' },
  { t: 'Alerts on email & WhatsApp', d: 'Set a target price from the panel; DealRadar messages you when it drops.' },
  { t: 'Private by design', d: 'It reads only the product you are viewing. No browsing history, logins or passwords leave your browser.' },
];

const STEPS = [
  ['Download', 'Click “Download for Chrome” below and unzip the file.'],
  ['Open extensions', 'In Chrome, go to chrome://extensions and switch on “Developer mode” (top right).'],
  ['Load it', 'Click “Load unpacked” and choose the unzipped dealradar-extension folder.'],
  ['Shop', 'Open any product on Amazon, Flipkart, Myntra… the DealRadar panel appears bottom-right.'],
];

export default function ExtensionPage() {
  return (
    <div className="space-y-14">
      <section className="hero-bg relative overflow-hidden rounded-[2rem] px-6 py-12 text-center ring-1 ring-orange-100 sm:px-12">
        <div className="blob blob-a" />
        <div className="blob blob-b" />
        <Reveal className="relative mx-auto max-w-2xl">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 text-3xl font-black text-white shadow-xl shadow-orange-500/30">₹</span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">DealRadar for Chrome</h1>
          <p className="mt-3 text-lg text-ink-soft">Price history, Deal Score and cheaper stores — right on the product page, including Zepto, Blinkit, Instamart, BigBasket and JioMart near you.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="/dealradar-extension.zip" download className="btn-primary px-6 py-3 text-base">⬇ Download for Chrome</a>
            <a href="#install" className="btn-ghost px-6 py-3 text-base">How to install</a>
          </div>
          <p className="mt-3 text-xs text-ink-mute">Works in Chrome, Edge, Brave and other Chromium browsers. Chrome Web Store listing coming soon.</p>
        </Reveal>
      </section>

      <section>
        <Reveal><h2 className="mb-4 text-2xl font-extrabold">What it does</h2></Reveal>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <StaggerItem key={f.t}>
              <div className="card h-full p-5">
                <h3 className="font-bold">{f.t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{f.d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section id="install" className="scroll-mt-24">
        <Reveal><h2 className="mb-4 text-2xl font-extrabold">Install in 1 minute</h2></Reveal>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <StaggerItem key={t}>
              <div className="card h-full p-5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 font-black text-white">{i + 1}</div>
                <h3 className="mt-3 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="card p-6 text-sm text-ink-soft">
        <h2 className="mb-2 text-lg font-bold text-ink">Why an extension?</h2>
        <p>
          Some stores — Amazon, Myntra, Zepto, Blinkit, Instamart — block price checks from servers. The extension runs in your own browser, so it sees exactly what you see,
          at your delivery location. Prices it finds are shared anonymously with DealRadar so everyone’s price history gets better.
        </p>
      </section>
    </div>
  );
}
