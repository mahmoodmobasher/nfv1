import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { nexaCrm } from "./nexa-crm-variants";

function classes(...values: Array<string | false | null | undefined>) {
  const base = values.filter(Boolean).join(" ");
  const variant = [
    base.includes("ds-action") && nexaCrm.action,
    base.includes("ds-panel") && nexaCrm.panel,
    base.includes("ds-stage-column") && nexaCrm.stage,
    base.includes("ds-form-section") && nexaCrm.formSection,
  ].filter(Boolean).join(" ");
  return `${base} ${variant}`.trim();
}

export type FeedbackTone = "info" | "success" | "warning" | "danger" | "conflict";
export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";
export type SectionTone = "overview" | "relationship" | "qualification" | "conversion" | "activity" | "access";

export function ProductPageHeader({
  title,
  description,
  action,
  context,
  marker,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  context?: string;
  marker?: ReactNode;
}) {
  return <header className={classes("product-page-header", "ds-page-header", nexaCrm.pageHeader)}><div className="ds-page-header__identity">{marker && <span className="ds-page-header__marker" aria-hidden="true">{marker}</span>}<div>{context && <p className="ds-page-header__eyebrow">{context}</p>}<h1>{title}</h1>{description && <div className="ds-page-header__description">{description}</div>}</div></div>{action && <div className="ds-page-header__actions product-page-actions">{action}</div>}</header>;
}

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
  tone,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: SectionTone;
}) {
  return <section className={classes("ds-panel", tone && "ds-panel--toned", tone && `ds-section-panel--${tone}`, className)}>{(title || description || action) && <header className="ds-panel__header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action && <div className="ds-panel__actions">{action}</div>}</header>}<div className="ds-panel__body">{children}</div></section>;
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
  return <section className={classes("ds-feedback", `ds-feedback--${tone}`, nexaCrm.feedback)} role={urgent ? "alert" : "status"} tabIndex={autoFocus ? -1 : undefined} autoFocus={autoFocus || undefined}><div><h2>{title}</h2>{children && <div className="ds-feedback__description">{children}</div>}</div>{action && <div className="ds-feedback__actions">{action}</div>}</section>;
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <section className={classes("ds-empty", nexaCrm.feedback)}><h2>{title}</h2>{children && <div>{children}</div>}{action && <div className="ds-empty__actions">{action}</div>}</section>;
}

export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className={classes("ds-loading", nexaCrm.feedback)} role="status" aria-label={label}><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <span className="ds-loading__row" aria-hidden="true" key={index} />)}</div>;
}

export function FieldMessage({ id, children, tone = "help" }: { id: string; children: ReactNode; tone?: "help" | "error" }) {
  return <small id={id} className={tone === "error" ? "ds-field-message ds-field-message--error" : "ds-field-message"}>{children}</small>;
}

export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return <div className={classes("ds-table-wrap", nexaCrm.tableWrap)}><table className="ds-table"><caption>{caption}</caption>{children}</table></div>;
}

export function DataToolbar({ label, htmlFor, children, helper, status }: { label: string; htmlFor?: string; children: ReactNode; helper?: ReactNode; status?: ReactNode }) {
  const heading = htmlFor ? <label className="ds-data-toolbar__label" htmlFor={htmlFor}>{label}</label> : <div className="ds-data-toolbar__label">{label}</div>;
  return <section className={classes("ds-data-toolbar", "ds-list-toolbar", nexaCrm.toolbar)} aria-label={`${label} controls`}>{heading}<div className="ds-data-toolbar__controls">{children}</div>{helper && <div className="ds-data-toolbar__helper">{helper}</div>}{status && <div className="ds-data-toolbar__status">{status}</div>}</section>;
}

export function RecordCards({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ds-record-cards" role="list" aria-label={label}>{children}</div>;
}

export function RecordCard({ title, href, secondary, facts, actions }: { title: string; href: string; secondary?: ReactNode; facts: Array<{ label: string; value: ReactNode }>; actions?: ReactNode }) {
  return <article className={classes("ds-record-card", nexaCrm.recordCard)} role="listitem"><header><div><h2><Link href={href}>{title}</Link></h2>{secondary && <div className="ds-record-card__secondary">{secondary}</div>}</div></header><dl>{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{actions && <div className="ds-record-card__actions">{actions}</div>}</article>;
}

export function RecordIdentity({ title, href, secondary, marker, meta }: { title: string; href?: string; secondary?: ReactNode; marker?: ReactNode; meta?: ReactNode }) {
  const heading = href ? <Link href={href}>{title}</Link> : title;
  return <div className="ds-record-identity">{marker && <span className="ds-record-identity__marker" aria-hidden="true">{marker}</span>}<div><h2>{heading}</h2>{secondary && <div className="ds-record-identity__secondary">{secondary}</div>}{meta && <div className="ds-record-identity__meta">{meta}</div>}</div></div>;
}

export function RecordWorkspace({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return <div className={classes("ds-record-workspace", nexaCrm.recordWorkspace)}><aside className={classes("ds-record-workspace__summary", nexaCrm.panel)}>{summary}</aside><div className={classes("ds-record-workspace__content", nexaCrm.panel)}>{children}</div></div>;
}

export function ContentTabs({ label, items }: { label: string; items: Array<{ href: string; label: string; active?: boolean }> }) {
  return <nav className="ds-content-tabs" aria-label={label}>{items.map(item => <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</a>)}</nav>;
}

export function RelationshipRow({ label, value, action }: { label: ReactNode; value: ReactNode; action?: ReactNode }) {
  return <div className="ds-relationship-row"><div><span>{label}</span><strong>{value}</strong></div>{action && <div className="ds-relationship-row__action">{action}</div>}</div>;
}

export function ViewTabs({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return <nav className={classes("ds-view-tabs", nexaCrm.viewTabs)} aria-label={label}>{items.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}</nav>;
}

export function StageColumn({ title, count, children, tone = "neutral", id, position }: { title: ReactNode; count?: ReactNode; children: ReactNode; tone?: "neutral" | "new" | "contacted" | "qualified" | "proposal"; id?: string; position?: number }) {
  const positionId = id && position !== undefined ? `${id}-position` : undefined;
  return <section className={classes("ds-stage-column", `ds-stage-column--${tone}`)} aria-labelledby={[positionId,id].filter(Boolean).join(" ") || undefined}><div className="pipeline-stage ds-stage-column__content"><header><div className="ds-stage-column__heading">{position !== undefined && <span id={positionId} className="ds-stage-column__identifier">Pipeline stage {position}</span>}<h2 id={id} tabIndex={-1}>{title}</h2></div>{count !== undefined && <span className="ds-stage-column__count">{count}</span>}</header><div className="ds-stage-column__items">{children}</div></div></section>;
}

export function FactsGrid({ children }: { children: ReactNode }) {
  return <dl className="ds-facts-grid">{children}</dl>;
}

export function WorkflowSummaryGrid({ children }: { children: ReactNode }) {
  return <div className="ds-workflow-summary-grid">{children}</div>;
}

export function FormWorkbench({ children, label }: { children: ReactNode; label?: string }) {
  return <div className={classes("ds-form-workbench", nexaCrm.formWorkbench)} aria-label={label}>{children}</div>;
}

export function FormSection({ id, number, title, description, tone = "overview", children }: { id: string; number: string; title: string; description: string; tone?: SectionTone; children: ReactNode }) {
  return <section className={classes("ds-form-section", `ds-section-panel--${tone}`)} aria-labelledby={id}><header className="ds-form-section__header"><span className="ds-form-section__number" aria-hidden="true">{number}</span><div><h2 id={id}>{title}</h2><p>{description}</p></div></header>{children}</section>;
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes("form-grid", "ds-form-grid", className)}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={classes("ds-page-actions", "ds-form-actions", nexaCrm.formActions)}>{children}</div>;
}

export function SectionNav({ label, items }: { label: string; items: Array<{ href: string; label: string }> }) {
  return <nav className={classes("ds-section-nav", nexaCrm.sectionNav)} aria-label={label}>{items.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav>;
}

export function ReviewWorkspace({ evidence, children }: { evidence: ReactNode; children: ReactNode }) {
  return <div className="ds-review-layout"><aside className="ds-review-evidence" aria-label="Review evidence">{evidence}</aside><section className="ds-review-decision" aria-label="Decision workspace">{children}</section></div>;
}

export function ReviewDecisionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className="ds-review-decision__header"><div><h2>{title}</h2>{description && <div>{description}</div>}</div>{action && <div className="ds-review-decision__action">{action}</div>}</header>;
}

export function ReviewDecisionGroup({ children }: { children: ReactNode }) {
  return <div className="ds-review-decision__group">{children}</div>;
}

export function ReviewDecisionSummary({ children }: { children: ReactNode }) {
  return <div className="ds-review-decision__summary">{children}</div>;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  return <div className="ds-admin-workspace">{children}</div>;
}

export function AdminPanel({ title, description, action, children, wide = false }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <section className={classes("ds-admin-panel", wide && "ds-admin-panel--wide")}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="ds-admin-panel__action">{action}</div>}</header><div className="ds-admin-panel__body">{children}</div></section>;
}
