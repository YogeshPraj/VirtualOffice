import type { ReactNode } from "react";

export function PxWindow({
  title,
  icon,
  onClose,
  children,
  actions,
}: {
  title: string;
  icon?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="px-window" role="dialog" aria-label={title}>
      <header className="titlebar">
        {icon}
        <span className="grow">{title}</span>
        {actions}
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close">
            X
          </button>
        )}
      </header>
      <div className="body">{children}</div>
    </section>
  );
}

export const CLASSIC_UI = (import.meta.env.VITE_PAPERCLIP_UI as string | undefined) ?? "http://127.0.0.1:3100";

export function ClassicLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a className="px-btn small" href={`${CLASSIC_UI}${path}`} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
