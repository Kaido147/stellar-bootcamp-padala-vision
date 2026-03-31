import type { PropsWithChildren, ReactNode } from "react";

export function LandingSection({
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  aside?: ReactNode;
}>) {
  return (
    <section className="rounded-[2rem] border border-line bg-white/[0.03] p-6 shadow-card backdrop-blur sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="section-kicker">{eyebrow}</div>
          <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-ink/68">{subtitle}</p>
        </div>
        {aside}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}
