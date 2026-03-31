import type { ReactNode } from "react";
import { Card } from "./Card";

export function WorkflowPageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  meta,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Card
      action={action}
      subtitle={subtitle}
      title={title}
    >
      {eyebrow ? <div className="section-kicker">{eyebrow}</div> : null}
      {meta ? <div className="grid gap-3 sm:grid-cols-3">{meta}</div> : null}
    </Card>
  );
}
