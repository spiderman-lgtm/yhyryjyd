// Reads a store page's bank/card offers and its own "price after offers" from the page's text, e.g. Flipkart's
// "Buy at ₹1,057" with "₹56 off Flipkart Axis Credit Card", or Amazon's "Upto ₹1,500.00 discount on SBI Credit Cards".

export interface BankOffer {
  // Rupees off this product's price.
  amount: number;
  text: string;
}

const rupees = (s: string) => Number(s.replace(/,/g, ''));
const BANK = String.raw`([A-Z][\w.&]*(?:\s+[A-Z][\w.&]*){0,3}?)\s+(?:Bank\s+)?(Credit|Debit)\s*Cards?`;

export function pageText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8377;|&#x20b9;|\\u20b9/gi, '₹')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/(?:\bINR|\bRs\.?)\s*(?=\d)/g, '₹')
    .replace(/\s+/g, ' ');
}

export function offersFromText(raw: string, price: number): { offer_price: number | null; offers: BankOffer[] } {
  const text = raw.replace(/(?:\bINR|\bRs\.?)\s*(?=\d)/g, '₹').replace(/\s+/g, ' ');
  const found: BankOffer[] = [];
  const add = (amount: number, text: string) => {
    amount = Math.round(amount);
    if (amount > 0 && amount <= price * 0.5) found.push({ amount, text: text.replace(/\s+/g, ' ').trim().slice(0, 90) });
  };

  // A flat amount: "₹56 off Flipkart Axis Credit Card", "Upto ₹1,500.00 discount on SBI Credit Cards".
  const flat = new RegExp(String.raw`(?:[Uu]p\s*[Tt]o\s*)?₹\s?([\d,]+(?:\.\d{1,2})?)\s*(?:[Ii]nstant\s+)?(?:[Oo]ff|[Dd]iscount|[Cc]ashback)\s*(?:on\s+|with\s+)?${BANK}`, 'g');
  for (const m of text.matchAll(flat)) add(rupees(m[1]), `₹${rupees(m[1]).toLocaleString('en-IN')} off · ${m[2]} ${m[3]} Card`);

  // A percentage with a cap: "10% Instant Discount up to ₹1,250 on HDFC Bank Credit Card".
  for (const m of text.matchAll(/(\d{1,2})%\s*(?:[Ii]nstant\s+)?(?:[Dd]iscount|[Oo]ff|[Cc]ashback)/g)) {
    const win = text.slice(m.index!, m.index! + 160);
    const bank = win.match(new RegExp(String.raw`(?:on|with|using)\s+${BANK}`));
    if (!bank) continue;
    const cap = win.match(/[Uu]p\s*[Tt]o\s*₹\s?([\d,]+)/);
    const pct = Number(m[1]);
    const amount = Math.min((price * pct) / 100, cap ? rupees(cap[1]) : Infinity);
    add(amount, `${pct}% off${cap ? ` up to ₹${rupees(cap[1]).toLocaleString('en-IN')}` : ''} · ${bank[1]} ${bank[2]} Card`);
  }

  const seen = new Set<string>();
  const offers = found
    .sort((a, b) => b.amount - a.amount)
    .filter((o) => (seen.has(o.text.toLowerCase()) ? false : (seen.add(o.text.toLowerCase()), true)))
    .slice(0, 4);

  // The store's own figure, when it shows one ("Buy at ₹1,057", "₹3,582 with Bank offer").
  let own: number | null = null;
  for (const m of text.matchAll(/(?:Buy at|Get at|Effective price:?|Price after offers?:?)\s*₹\s?([\d,]+)|₹\s?([\d,]+)\s*with\s+(?:[Bb]ank\s+)?[Oo]ffers?/g)) {
    const v = rupees(m[1] ?? m[2]);
    if (v < price && v >= price * 0.5) own = own === null ? v : Math.min(own, v);
  }
  const best = offers[0] ? price - offers[0].amount : null;
  return { offer_price: own ?? best, offers };
}
