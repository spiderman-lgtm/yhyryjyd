// Shop-local time helpers. `offsetMs` lets the demo dashboard "time travel" so the
// reminder and overdue-payment ladders can be shown without waiting days.
import { config } from './config.js';

let offsetMs = 0;
export const now = () => new Date(Date.now() + offsetMs);
export const travel = (hours) => { offsetMs += hours * 3_600_000; return now(); };
export const resetTravel = () => { offsetMs = 0; };
export const travelledHours = () => offsetMs / 3_600_000;

const tz = () => config.timezone;

export function parts(date = now()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

// Minutes the shop timezone is ahead of UTC at `date`.
function tzOffsetMin(date) {
  const p = parts(date);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - date.getTime()) / 60000);
}

// Build a Date for a wall-clock time in the shop timezone.
export function localDate(y, m, d, h = 0, min = 0) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  return new Date(guess.getTime() - tzOffsetMin(guess) * 60000);
}

export function addDaysLocal(days, h, min = 0, from = now()) {
  const p = parts(from);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return localDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, min);
}

export function fmt(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function isoLocal(date = now()) {
  const p = parts(date);
  const off = tzOffsetMin(date);
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}:00${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export const inQuietHours = (date = now()) => {
  const { h } = parts(date);
  const { quietHourStart: s, quietHourEnd: e } = config.scheduler;
  return h >= s || h < e;
};

export const isLastDayOfMonth = (date = now()) => {
  const p = parts(date);
  return new Date(Date.UTC(p.y, p.m, 0)).getUTCDate() === p.d;
};

export const monthKey = (date = now()) => { const p = parts(date); return `${p.y}-${String(p.m).padStart(2, '0')}`; };

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
