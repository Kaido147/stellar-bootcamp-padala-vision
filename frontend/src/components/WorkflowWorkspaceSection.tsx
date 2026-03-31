import type { PropsWithChildren, ReactNode } from "react";
import { SectionCard } from "./SectionCard";

export function WorkflowWorkspaceSection({
  title,
  subtitle,
  empty,
  children,
  action,
}: PropsWithChildren<{
  title: string;
  subtitle: string;
  empty: string;
  action?: ReactNode;
}>) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <SectionCard action={action} subtitle={subtitle} title={title}>
      {hasChildren ? children : <div className="rounded-2xl border border-line bg-night/80 p-4 text-sm text-ink/64">{empty}</div>}
    </SectionCard>
  );
}
