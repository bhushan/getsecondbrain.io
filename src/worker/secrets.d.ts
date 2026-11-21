// Secrets are not in wrangler.jsonc, so `wrangler types` does not know them.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Emails allowed to sign in during the private beta, separated by commas or spaces. */
  ALLOWED_EMAILS?: string;
}
