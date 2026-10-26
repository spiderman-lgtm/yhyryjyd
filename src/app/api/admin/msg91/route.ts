import { NextResponse } from 'next/server';
import { guard, errorJson } from '@/lib/admin-guard';
import { read, write, type Msg91Template } from '@/lib/db';
import { MSG91, runOperatorAction } from '@/lib/viasocket';
import { MSG91_TEMPLATES, type Msg91TemplateKey } from '@/lib/msg91';
import { refreshMsg91Templates } from '@/lib/msg91-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KEYS: Msg91TemplateKey[] = ['confirm', 'drop'];

// Admin's MSG91 setup: pick the WhatsApp number, create the two templates, check Meta's approval, send a test.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const m = read((d) => d.settings.msg91);
  if (!m) return NextResponse.json({ error: 'Connect MSG91 first.' }, { status: 400 });
  try {
    if (b.op === 'number') {
      const number = String(b.number || '').replace(/\D/g, '');
      if (!number) return NextResponse.json({ error: 'Choose your MSG91 WhatsApp number.' }, { status: 400 });
      write((d) => {
        d.settings.msg91 = { ...d.settings.msg91!, number, templates: d.settings.msg91!.number === number ? d.settings.msg91!.templates : null };
      });
      return NextResponse.json({ ok: true });
    }
    if (!m.number) return NextResponse.json({ error: 'Choose your MSG91 WhatsApp number first.' }, { status: 400 });

    if (b.op === 'templates') {
      const made: Record<string, Msg91Template> = {};
      for (const k of KEYS) {
        const t = MSG91_TEMPLATES[k];
        try {
          await runOperatorAction(MSG91.service_id, m.auth_id, MSG91.create_template.action_version_id, {
            integrated_number: m.number,
            template_name: t.name,
            language: 'en',
            category: 'UTILITY',
            parameter_format: 'NUMBER',
            components: [],
            body: { text: t.body, variable_examples: JSON.stringify(t.examples) },
          });
        } catch (e) {
          // Made on an earlier click: keep going and read its status below. Anything else (Meta refusing the
          // number's account, say) is shown in Admin.
          const msg = e instanceof Error ? e.message : String(e);
          // Meta answers a second creation of the same name with a category or language clash.
          if (!/already exists|duplicate|already associated with this template|already .* content for this template/i.test(msg)) throw new Error(`Creating “${t.name}” failed: ${msg}`);
        }
        made[k] = { name: t.name, status: 'PENDING' };
      }
      write((d) => {
        d.settings.msg91 = { ...d.settings.msg91!, templates: made as { confirm: Msg91Template; drop: Msg91Template }, error: null };
      });
      b.op = 'status';
    }

    if (b.op === 'status') {
      const r = await refreshMsg91Templates();
      return NextResponse.json({ ok: true, ...r });
    }

    if (b.op === 'test') {
      const to = String(b.to || '').replace(/\D/g, '');
      const phone = to.length === 10 ? '91' + to : to;
      const t = read((d) => d.settings.msg91?.templates?.confirm);
      if (!t?.fields?.length) return NextResponse.json({ error: 'The confirmation template is not approved yet — check its status first.' }, { status: 400 });
      const components = Object.fromEntries(t.fields.map((key, i) => [key, MSG91_TEMPLATES.confirm.examples[i] ?? '-']));
      const r = await runOperatorAction(MSG91.service_id, m.auth_id, MSG91.send_template.action_version_id, { integrated_number: m.number, name: t.name, components, to: phone });
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  } catch (e) {
    write((d) => {
      if (d.settings.msg91) d.settings.msg91.error = e instanceof Error ? e.message : String(e);
    });
    return errorJson(e);
  }
}
