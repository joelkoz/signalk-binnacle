// The XML entity escape and unescape pair shared by the GPX serializer and parser, so the entity set
// has one source of truth across the route export and import.

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

const XML_UNESCAPES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  quot: '"',
};

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

export function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|apos|quot);/g, (match, code) => {
    if (code[0] === '#') {
      const cp =
        code[1] === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return XML_UNESCAPES[code] ?? match;
  });
}
