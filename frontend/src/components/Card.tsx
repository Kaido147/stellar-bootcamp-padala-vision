import type { PropsWithChildren, ReactNode } from "react";

export function Card({
  children,
  title,
  subtitle,
  action,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}>) {
  return (
    <section className="surface-panel p-5 sm:p-6">
      {title ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-6 text-ink/62">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
