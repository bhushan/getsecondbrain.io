import { appLogo } from "../appLogos";

/** An app's logo on a small tile, or a neutral plug when the app has no logo. */
export function AppMark({ id, size = "md" }: { id: string | undefined; size?: "sm" | "md" | "lg" }) {
  const logo = id ? appLogo(id) : undefined;
  return (
    <span className={`app-mark app-mark-${size}`} aria-hidden="true">
      {logo ? (
        <img src={logo.src} alt="" className={logo.mono ? "logo-mono" : undefined} />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 7V4M15 7V4" />
          <path d="M6.5 7h11v4a5.5 5.5 0 0 1-11 0z" />
          <path d="M12 16.5V20" />
        </svg>
      )}
    </span>
  );
}
