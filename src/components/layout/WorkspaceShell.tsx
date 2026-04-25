import type { PropsWithChildren, ReactNode } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn("grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] lg:items-start", className)}>
      {children}
    </section>
  );
}

export function MainWorkspace({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("space-y-5 min-w-0", className)}>{children}</div>;
}

export function StickyControlRail({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <aside
      className={cn(
        "space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto lg:pr-1",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function Panel({
  children,
  className,
  header,
  style,
}: PropsWithChildren<{ className?: string; header?: ReactNode; style?: CSSProperties }>) {
  return (
    <article className={cn("glass-panel p-6", className)} style={style}>
      {header ? <div className="mb-4">{header}</div> : null}
      {children}
    </article>
  );
}
