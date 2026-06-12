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
  // The character class matches exactly the XML_ESCAPES keys, so the lookup always hits.
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);
}

export function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|apos|quot);/g, (match, code) => {
    if (code[0] === '#') {
      const cp =
        code[1] === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      // Guard the Unicode range: String.fromCodePoint throws RangeError for a code point above
      // U+10FFFF or below 0, so an out-of-range numeric entity in an imported GPX file stays literal
      // rather than throwing an uncaught error that aborts the whole import.
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
    // The named alternation matches exactly the XML_UNESCAPES keys, so the lookup always hits.
    return XML_UNESCAPES[code];
  });
}
