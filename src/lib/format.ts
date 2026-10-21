export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// "Delivers to 560001 by 23 Oct", or that it does not deliver there.
export function deliveryText(d: { pin: string; ok: boolean; by: string | null } | undefined) {
  if (!d) return '';
  if (!d.ok) return `Doesn’t deliver to ${d.pin}`;
  return d.by ? `Delivers to ${d.pin} by ${new Date(d.by).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : `Delivers to ${d.pin}`;
}
