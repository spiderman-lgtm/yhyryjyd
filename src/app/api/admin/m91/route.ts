import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { M91Error, alertShopper, alertTeam, apiKeyOwner, inviteShopper, shopperAlertsOn, teamAlertsOn, teamChannel } from '@/lib/m91';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const m = e instanceof M91Error ? (e.code === 'CHANNEL_EMPTY' ? 'Nobody can be reached yet — the people need M91 installed and the invite accepted.' : e.message) : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: m }, { status: 400 });
};

// Admin's M91 section: whether each half is set up, and a test that rings a real phone.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.op === 'status') {
      const [team, owner] = await Promise.all([
        teamAlertsOn() ? teamChannel().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })) : null,
        shopperAlertsOn() ? apiKeyOwner().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })) : null,
      ]);
      return NextResponse.json({ team, shoppers: owner });
    }
    if (b.op === 'test-team') {
      const sent = await alertTeam({
        title: 'DealRadar test: M91 is set up',
        description: 'This is the test from DealRadar Admin. Tap "It rang" to confirm.',
        severity: 'LOW',
        responseOptions: [
          { label: 'It rang', effect: 'SHARED' },
          { label: 'Seen', effect: 'PERSONAL' },
        ],
        isAutoClose: true,
      });
      return NextResponse.json({ delivered: sent?.delivered ?? 0 });
    }
    if (b.op === 'test-shopper') {
      let phone = String(b.phone || '').replace(/\D/g, '');
      if (phone.length === 10) phone = '91' + phone;
      if (phone.length < 11) return NextResponse.json({ error: 'Enter the number with country code.' }, { status: 400 });
      const invite = await inviteShopper(phone);
      if (!invite.reachable) return NextResponse.json({ invited: true, reachable: false });
      const sent = await alertShopper(phone, {
        title: 'DealRadar test: price-drop rings work',
        description: 'This is how a shopper hears about a price drop.',
        severity: 'LOW',
        responseOptions: [
          { label: 'Open the deal', effect: 'SHARED' },
          { label: 'Not now', effect: 'PERSONAL' },
        ],
        isAutoClose: true,
      });
      return NextResponse.json({ invited: true, reachable: true, delivered: sent.delivered });
    }
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
