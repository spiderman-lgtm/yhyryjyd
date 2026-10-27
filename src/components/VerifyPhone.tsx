'use client';

import { useState } from 'react';
import { callApi } from '@/lib/api-client';

const digits = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? '91' + d : d;
};

// A phone box that proves the number: "Send code" sends 6 digits on WhatsApp, typing them back verifies it.
// A number this account already verified shows ✓ and needs nothing.
export default function VerifyPhone({ id, label, value, onChange, verified, onVerified }: { id: string; label: string; value: string; onChange: (v: string) => void; verified: string[]; onVerified: (phone: string) => void }) {
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
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
          <button type="button" disabled={busy} onClick={send} className="btn-ghost shrink-0 px-3 text-sm">{busy ? 'Sending…' : 'Send code'}</button>
        ) : null)}
      </div>
      {step === 'sent' && !ok && (
        <div className="mt-2 flex gap-2">
          <input className="input flex-1" placeholder="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button type="button" disabled={busy || code.length !== 6} onClick={check} className="btn-dark shrink-0 px-4 text-sm">{busy ? '…' : 'Verify'}</button>
          <button type="button" disabled={busy} onClick={send} className="btn-ghost shrink-0 px-3 text-xs">Resend</button>
        </div>
      )}
      {msg && <p className={`mt-1 text-xs ${step === 'sent' ? 'text-ink-mute' : 'text-red-600'}`}>{msg}</p>}
    </div>
  );
}
