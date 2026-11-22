export type MenuItem = { id: string; section?: string };
export type Menu = { title: string; note: string; paper: string; blurbs: boolean; items: MenuItem[] };

export function encodeMenu(menu: Menu): string {
  const bytes = new TextEncoder().encode(JSON.stringify(menu));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeMenuPayload(payload: string): unknown {
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
