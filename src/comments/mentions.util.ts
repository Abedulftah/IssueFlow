export function extractMentions(content: string): string[] {
  const matches = content.matchAll(/@([a-zA-Z0-9_]+)/g);
  const seen = new Set<string>();
  for (const [, name] of matches) {
    seen.add(name.toLowerCase());
  }
  return [...seen];
}
