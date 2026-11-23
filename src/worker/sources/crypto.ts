/**
 * Source tokens are sealed with AES-GCM before they are stored. The key is the `SOURCES_KEY`
 * secret: 32 random bytes, base64. The associated data binds a sealed value to its owner, so a
 * value copied to another row does not open.
 */

const bytesFromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** The sealing key, or null when the secret is missing, empty or not 32 bytes. */
export async function sourcesKey(env: { SOURCES_KEY?: string }): Promise<CryptoKey | null> {
  let raw: Uint8Array;
  try {
    raw = bytesFromBase64((env.SOURCES_KEY ?? "").trim());
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, owner: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) }, key, data));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return base64(out);
}

export async function unseal<T>(key: CryptoKey, owner: string, text: string): Promise<T> {
  const bytes = bytesFromBase64(text);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(owner) },
    key,
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
