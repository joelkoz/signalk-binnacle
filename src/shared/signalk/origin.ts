export function serverOrigin(): string {
  return `${location.protocol}//${location.host}`;
}

// The stream URL, optionally carrying the auth token as a query parameter.
//
// Security note (token in URL): browsers cannot set an Authorization header on a
// WebSocket handshake, so the token must travel another way. The two header-free
// options are a query parameter and the WebSocket subprotocol
// (new WebSocket(url, ['Bearer', token])). We tested both against a live Signal K
// server (2.28): the subprotocol form opens the socket but the server does NOT
// authenticate from it (zero data delivered), while the query parameter is the only
// form that actually streams data. So query-string auth is required here, not a
// preference. The exposure is bounded: this is a same-origin connection to the boat's
// own server over the LAN, the token is a device token scoped to read, and the URL is
// not sent to any third party. To harden, serve Signal K over TLS (wss) so the URL is
// encrypted in transit, and keep the server's access logs off or scrubbed of `token`.
// The connection appends `subscribe=none` via withQuery, so this only adds the token.
export function streamUrl(token?: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${scheme}//${location.host}/signalk/v1/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
