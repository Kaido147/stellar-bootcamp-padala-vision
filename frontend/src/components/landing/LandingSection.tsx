import type { PropsWithChildren, ReactNode } from "react";

export function LandingSection({
  eyebrow,
  title,
  subtitle,
  aside,
  className = "",
  contentClassName = "",
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
}>) {
  return (
    <section className={`rounded-[2rem] border border-line bg-white/[0.03] p-6 shadow-card backdrop-blur sm:p-8 ${className}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="section-kicker">{eyebrow}</div>
          <h2 className="mt-3 max-w-3xl font-display text-3xl text-ink sm:text-[2.35rem]">{title}</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink/66 sm:text-base">{subtitle}</p>
        </div>
        {aside}
      </div>
      <div className={`mt-8 ${contentClassName}`}>{children}</div>
    </section>
  );
}
