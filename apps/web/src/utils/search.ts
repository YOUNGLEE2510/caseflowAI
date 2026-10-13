export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const aliases: Record<string, string> = {
  mssv: "ma sinh vien", sv: "sinh vien", hp: "hoc phi", ktx: "ky tuc xa", mk: "mat khau", cntt: "cong nghe thong tin", wifi: "wi fi"
};

export function searchTokens(value: string) {
  return normalizeSearch(value).split(/\s+/).filter(Boolean).flatMap(token => (aliases[token] || token).split(" "));
}

export function matchesSearch(value: string, query: string) {
  const haystack = searchTokens(value).join(" ");
  const stopWords = new Set("toi em minh ban can xin cho cua cac va la gi nao lam sao de voi co khong the a an how do i my please".split(" "));
  return searchTokens(query).filter(token => !stopWords.has(token)).every(token => haystack.includes(token));
}
