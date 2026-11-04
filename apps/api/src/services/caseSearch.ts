export function searchTerms(value: string) {
  return [...new Set(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().match(/[a-z0-9]+/g) || [])].filter(word => word.length >= 2).slice(0, 128);
}

export function caseSearchTokens(record: { code?: string; title?: string; requesterName?: string }) {
  const prefixes = new Set<string>();
  for (const word of searchTerms(`${record.code || ""} ${record.title || ""} ${record.requesterName || ""}`)) {
    for (let size = 2; size <= Math.min(word.length, 64); size++) prefixes.add(word.slice(0, size));
  }
  return [...prefixes];
}
