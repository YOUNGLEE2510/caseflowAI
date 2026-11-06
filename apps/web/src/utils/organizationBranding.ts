export const institutionName = "Học viện Công nghệ Bưu chính Viễn thông";
export const institutionEnglishName = "Posts and Telecommunications Institute of Technology";

export function organizationDisplayName(name: string, slug?: string) {
  return slug === "minh-khai-university" ? institutionName : name;
}
