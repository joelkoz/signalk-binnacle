export function fullJitterDelay(attempt: number, base = 500, cap = 30000): number {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.random() * ceiling;
}
