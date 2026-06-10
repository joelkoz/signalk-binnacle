// Test-only in-memory Storage stand-in for PersistedValue-backed stores. Imported by *.test.ts
// files, never by production code.
export function createFakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}
