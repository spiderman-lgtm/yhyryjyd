import 'server-only';
import { derivedKey } from './viasocket';

export function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// Behind the host's proxy the request URL can be internal, so redirects use the public URL.
export function absolute(path: string) {
  return new URL(path, appUrl() + '/');
}

export function secureCookies() {
  return appUrl().startsWith('https:');
}

export function linkSig(alertId: string) {
  return derivedKey(`alert-link:${alertId}`).slice(0, 22);
}
