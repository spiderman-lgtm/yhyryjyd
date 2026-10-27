'use client';

import { useState } from 'react';
import { callApi } from '@/lib/api-client';

const digits = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? '91' + d : d;
};

// A phone box that proves the number: "Send code" sends 6 digits on WhatsApp, typing them back verifies it.
// A number this account already verified shows ✓ and needs nothing.
export default function VerifyPhone({ id, label, value, onChange, verified, onVerified, waVerify = false }: { id: string; label: string; value: string; onChange: (v: string) => void; verified: string[]; onVerified: (phone: string) => void; waVerify?: boolean }) {
  const [step, setStep] = useState<'idle' | 'sent' | 'waiting'>('idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const phone = digits(value);
  const ok = !!phone && verified.includes(phone);

  const send = async () => {
    setBusy(true);
    setMsg('');
    const { ok: sent, data } = await callApi<Record<string, any>>('/api/otp', { body: { op: 'send', phone } });
    setBusy(false);
    if (!sent) return setMsg(data.error || 'Could not send the code.');
    if (data.verified) return onVerified(phone);
    setStep('sent');
    setMsg('We sent a 6-digit code to this number on WhatsApp.');
  };
  // Opens WhatsApp with a code to send to DealRadar's number, then waits for it to arrive (up to 5 minutes).
  const viaWhatsApp = async () => {
    setBusy(true);
    setMsg('');
    const { ok: started, data } = await callApi<Record<string, any>>('/api/otp', { body: { op: 'wa_start', phone } });
    setBusy(false);
    if (!started) return setMsg(data.error || 'Could not start.');
    window.open(data.link, '_blank', 'noopener');
    setStep('waiting');
    setMsg('Tap Send in WhatsApp — we verify the number that sends it.');
    const before = new Set(verified);
    const until = Date.now() + 5 * 60_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 3000));
      const { ok, data: s } = await callApi<Record<string, any>>('/api/otp', { body: { op: 'status', phone } });
      const fresh: string[] = ok ? (s.verified || []).filter((p: string) => !before.has(p)) : [];
      if (fresh.length) {
        fresh.forEach(onVerified);
        // The number that sent the code is the one verified.
        if (!fresh.includes(phone)) onChange('+' + fresh[0]);
        setStep('idle');
        setMsg('');
        return;
      }
    }
    setStep('idle');
    setMsg('No message arrived yet. Tap “Verify on WhatsApp” again.');
  };

  const check = async () => {
    setBusy(true);
    setMsg('');
    const { ok: good, data } = await callApi<Record<string, any>>('/api/otp', { body: { op: 'check', phone, code } });
    setBusy(false);
    if (!good) return setMsg(data.error || 'That code is not right.');
    setStep('idle');
    setCode('');
    onVerified(phone);
  };

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} className="input flex-1" placeholder="+91 98765 43210" inputMode="tel" value={value} onChange={(e) => (onChange(e.target.value), setStep('idle'), setMsg(''))} />
        {phone.length >= 11 && (ok ? (
          <span className="grid shrink-0 place-items-center rounded-xl bg-deal-light px-3 text-sm font-semibold text-deal">✓ Verified</span>
        ) : step === 'idle' ? (
          <>
            {waVerify && <button type="button" disabled={busy} onClick={viaWhatsApp} className="shrink-0 rounded-xl bg-[#25d366] px-3 text-sm font-semibold text-white hover:opacity-90">Verify on WhatsApp</button>}
            <button type="button" disabled={busy} onClick={send} className="btn-ghost shrink-0 px-3 text-sm">{busy ? 'Sending…' : waVerify ? 'Send code' : 'Send code'}</button>
          </>
        ) : step === 'waiting' ? (
          <span className="grid shrink-0 place-items-center rounded-xl bg-slate-100 px-3 text-sm text-ink-mute">Waiting…</span>
        ) : null)}
      </div>
      {step === 'sent' && !ok && (
        <div className="mt-2 flex gap-2">
          <input className="input flex-1" placeholder="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button type="button" disabled={busy || code.length !== 6} onClick={check} className="btn-dark shrink-0 px-4 text-sm">{busy ? '…' : 'Verify'}</button>
          <button type="button" disabled={busy} onClick={send} className="btn-ghost shrink-0 px-3 text-xs">Resend</button>
        </div>
      )}
      {msg && <p className={`mt-1 text-xs ${step !== 'idle' ? 'text-ink-mute' : 'text-red-600'}`}>{msg}</p>}
    </div>
  );
}
