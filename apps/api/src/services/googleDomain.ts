export function googleDomainAllowed(hostedDomain: string | undefined, allowed: string[]) {
  if (!allowed.length) return true;
  return typeof hostedDomain === "string" && allowed.some(domain => domain.trim().toLowerCase() === hostedDomain.toLowerCase());
}
