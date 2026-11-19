// 💬 @mentions: comment la "@Bala" nu irundhaa, board la irukkura Bala va kandupidi

export interface Person {
  _id: unknown;
  name: string;
}

// Comment la irukkura @peyargal. \p{M} = Tamil / Sinhala / Hindi uyirmei kurigal (ி, ා, ि): illana 'கவி' → 'கவ' aagidum!
// Kadaisi '.' / '-' eduthudu: '@Bala.' → 'bala'
export function mentionTokens(text: string): string[] {
  return [...text.matchAll(/(^|\s)@([\p{L}\p{M}\p{N}_.-]{2,40})/gu)]
    .map((m) => m[2].replace(/[.-]+$/, '').toLowerCase())
    .filter((t) => t.length >= 2);
}

// Token → aal: mudhal peru illa full peru (space illaama) match aanaa
export function findMentioned<T extends Person>(text: string, people: T[]): T[] {
  const tokens = new Set(mentionTokens(text));
  if (!tokens.size) return [];
  return people.filter((p) => {
    const first = p.name.split(/\s+/)[0].toLowerCase();
    const joined = p.name.replace(/\s+/g, '').toLowerCase();
    return tokens.has(first) || tokens.has(joined);
  });
}
