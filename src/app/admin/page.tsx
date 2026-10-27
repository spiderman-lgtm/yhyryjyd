import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminConsole from '@/components/admin/AdminConsole';
import CouponManager from '@/components/admin/CouponManager';
import { read, type Tier } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { TIER_INFO } from '@/lib/alerts';
import { GMAIL, MSG91, TELEGRAM, WHATSAPP, flowRunCounts, listConnections } from '@/lib/viasocket';
import { ensureMailFlow } from '@/lib/flows';
import { syncBotFromListener } from '@/lib/telegram';
import { inboundUrl } from '@/lib/wa-session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'DealRadar admin', robots: { index: false } };

export default async function AdminPage() {
  const user = currentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'owner') {
    return (
      <div className="card mx-auto max-w-md p-6 text-center text-sm">
        <h1 className="text-lg font-bold">Owner access only</h1>
        <p className="mt-2 text-ink-soft">You are signed in as {user.email}, which is not the DealRadar owner account.</p>
        <Link href="/" className="btn-dark mt-4">Back to DealRadar</Link>
      </div>
    );
  }

  // Sets up the instant email automation if Gmail is connected but it does not exist yet.
  await ensureMailFlow().catch(() => null);
  // Keeps the bot username (used in shoppers' "Open Telegram" links) matching the connected bot.
  await syncBotFromListener().catch(() => null);

  const data = read((d) => ({
    settings: d.settings,
    stats: {
      products: Object.keys(d.products).length,
      activeAlerts: Object.values(d.alerts).filter((a) => a.status === 'active').length,
      byTier: (['urgent', 'normal', 'digest'] as Tier[]).map((t) => Object.values(d.alerts).filter((a) => a.status === 'active' && a.tier === t).length),
      clicks7d: d.clicks.filter((c) => Date.parse(c.at) > Date.now() - 7 * 86400_000).length,
      cartItems: Object.keys(d.cart).length,
    },
    enquiries: d.enquiries.slice(-20).reverse().map((e) => ({ ...e, product: d.products[e.product_id]?.title ?? e.product_id })),
    deliveries: d.deliveries.slice(-10).reverse(),
    coupons: Object.values(d.store_coupons).map(({ voters, ...c }) => c),
    suggestions: Object.values(d.coupon_suggestions)
      .filter((x) => x.status === 'pending')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  }));

  let connError = '';
  let expired: Record<string, boolean> = {};
  try {
    const conns = await listConnections();
    expired = Object.fromEntries(conns.map((c) => [c.id, !!c.isExpired]));
  } catch (e) {
    connError = e instanceof Error ? e.message : String(e);
  }

  const flows = await Promise.all(
    (['urgent', 'normal', 'digest'] as Tier[]).map(async (tier) => {
      const id = data.settings.flows[tier];
      const counts = id ? await flowRunCounts(id).catch(() => null) : null;
      return { tier, label: TIER_INFO[tier].label, every: TIER_INFO[tier].every, id: id ?? null, status: id ? data.settings.flow_status?.[id] ?? 'active' : null, counts };
    }),
  );

  return (
    <AdminConsole
      apps={{ gmail: { ...GMAIL }, whatsapp: { ...WHATSAPP }, telegram: { service_id: TELEGRAM.service_id, name: TELEGRAM.name, icon: TELEGRAM.icon, send_message: { action_id: TELEGRAM.send_message.action_id } }, msg91: { service_id: MSG91.service_id, name: MSG91.name, icon: MSG91.icon, send_template: { action_id: MSG91.send_template.action_id } } }}
      settings={data.settings}
      expired={{ gmail: !!(data.settings.gmail && expired[data.settings.gmail.auth_id]), whatsapp: !!(data.settings.whatsapp && expired[data.settings.whatsapp.auth_id]), telegram: !!(data.settings.telegram && expired[data.settings.telegram.auth_id]), msg91: !!(data.settings.msg91 && expired[data.settings.msg91.auth_id]) }}
      connError={connError}
      waInboundUrl={inboundUrl()}
      flows={flows}
      stats={data.stats}
      enquiries={data.enquiries}
      deliveries={data.deliveries}
    >
      <CouponManager initial={data.coupons} suggestions={data.suggestions} checkedAt={data.settings.offers_checked_at ?? null} />
    </AdminConsole>
  );
}
