const aliases: Record<string, string> = {
  mssv: "mã sinh viên", sv: "sinh viên", hp: "học phí", ktx: "ký túc xá", mk: "mật khẩu", cntt: "công nghệ thông tin", wifi: "wi fi"
};
const stopWords = new Set("tôi em mình bạn cần xin cho của các và là gì nào làm sao để với có không the a an how do i my please".split(" "));

export function expandKnowledgeQuery(query: string) {
  return query.normalize("NFC").toLowerCase().replace(/\b(?:mssv|sv|hp|ktx|mk|cntt|wifi)\b/g, token => aliases[token]);
}

export function knowledgeTerms(query: string) {
  const terms = expandKnowledgeQuery(query).match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(terms.filter(term => term.length > 1 && !stopWords.has(term)))];
}

export function normalizedKnowledgeText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
}
