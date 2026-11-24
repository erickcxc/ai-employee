// Where a draft card returns after approve or reject. Only the team app pages that show draft cards
// are allowed, so a crafted form cannot send someone to another site (open redirect).
const ALLOWED = /^\/(today|texts(\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$/;

export function safeBack(value: unknown): string {
  return typeof value === "string" && ALLOWED.test(value) ? value : "/today";
}
