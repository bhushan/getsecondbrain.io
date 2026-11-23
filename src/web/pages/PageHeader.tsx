import type { ReactNode } from "react";

/** The title block every app page opens with. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <header className="pg-header">
      {eyebrow && <p className="pg-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p className="pg-lede">{children}</p>
    </header>
  );
}
