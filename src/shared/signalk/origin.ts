export function serverOrigin(): string {
  return `${location.protocol}//${location.host}`;
}

export function streamUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/signalk/v1/stream`;
}
