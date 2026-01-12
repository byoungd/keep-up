export type Token = {
  id: string;
  text: string;
};

export function createTokenId(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `t_${(hash >>> 0).toString(36)}`;
}

export function tokenize(text: string): Token[] {
  if (!text.trim()) {
    return [];
  }

  const parts = text.split(/\s+/).filter(Boolean);
  return parts.map((part, index) => ({
    id: createTokenId(`${index}:${part}`),
    text: part,
  }));
}
