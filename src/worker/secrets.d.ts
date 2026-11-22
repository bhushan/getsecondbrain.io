// Secrets are not in wrangler.jsonc, so `wrangler types` does not know them.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Emails allowed to sign in while SIGNUP is not "open", separated by commas or spaces. */
  ALLOWED_EMAILS?: string;
  /** 32 random bytes, base64: seals the tokens of connected sources such as Granola. */
  SOURCES_KEY?: string;
}
