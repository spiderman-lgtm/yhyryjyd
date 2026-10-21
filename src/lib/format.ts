export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
