export function retainServiceFields(fields: Record<string, string>, allowedFields: string[]) {
  const allowed = new Set(allowedFields);
  return Object.fromEntries(Object.entries(fields).filter(([field]) => allowed.has(field)));
}
