export function serverOrigin(): string {
  return `${location.protocol}//${location.host}`;
}

// The stream URL, optionally carrying the auth token. Browsers cannot set headers
// on a WebSocket handshake, so Signal K accepts the token as a query parameter. The
// connection appends `subscribe=none` via withQuery, so this only adds the token.
export function streamUrl(token?: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${scheme}//${location.host}/signalk/v1/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
