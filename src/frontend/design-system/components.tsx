import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type FeedbackTone = "info" | "success" | "warning" | "danger" | "conflict";
export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function ActionLink({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "tertiary";
  className?: string;
}) {
  return <Link href={href} className={classes("ds-action", `ds-action--${variant}`, className)}>{children}</Link>;
}

export function Button({
  variant = "secondary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary" | "danger";
}) {
  return <button className={classes("ds-action", `ds-action--${variant}`, className)} {...props}>{children}</button>;
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section className={classes("ds-panel", className)}>{(title || description || action) && <header className="ds-panel__header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action && <div className="ds-panel__actions">{action}</div>}</header>}<div className="ds-panel__body">{children}</div></section>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}

export function FeedbackState({
  title,
  children,
  tone = "info",
  action,
  autoFocus = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  tone?: FeedbackTone;
  action?: ReactNode;
  autoFocus?: boolean;
}) {
  const urgent = tone === "danger" || tone === "conflict";
  return <section className={`ds-feedback ds-feedback--${tone}`} role={urgent ? "alert" : "status"} tabIndex={autoFocus ? -1 : undefined} autoFocus={autoFocus || undefined}><div><h2>{title}</h2>{children && <div className="ds-feedback__description">{children}</div>}</div>{action && <div className="ds-feedback__actions">{action}</div>}</section>;
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <section className="ds-empty"><h2>{title}</h2>{children && <div>{children}</div>}{action && <div className="ds-empty__actions">{action}</div>}</section>;
}

export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className="ds-loading" role="status" aria-label={label}><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <span className="ds-loading__row" aria-hidden="true" key={index} />)}</div>;
}

export function FieldMessage({ id, children, tone = "help" }: { id: string; children: ReactNode; tone?: "help" | "error" }) {
  return <small id={id} className={tone === "error" ? "ds-field-message ds-field-message--error" : "ds-field-message"}>{children}</small>;
}

export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return <div className="ds-table-wrap"><table className="ds-table"><caption>{caption}</caption>{children}</table></div>;
}

export function ViewTabs({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return <nav className="ds-view-tabs" aria-label={label}>{items.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}</nav>;
}
