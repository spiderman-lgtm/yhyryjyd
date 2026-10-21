import 'server-only';
import { derivedKey } from './viasocket';

export function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function linkSig(alertId: string) {
  return derivedKey(`alert-link:${alertId}`).slice(0, 22);
}
