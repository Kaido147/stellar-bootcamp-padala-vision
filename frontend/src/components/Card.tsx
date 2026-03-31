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
    <section className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur">
      {title ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-ink/65">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
