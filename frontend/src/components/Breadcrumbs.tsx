import { Link } from "react-router-dom";

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; to?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ink/55">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.to ? (
            <Link className="font-semibold text-ink/68 hover:text-ink" to={item.to}>
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{item.label}</span>
          )}
          {index < items.length - 1 ? <span>/</span> : null}
        </div>
      ))}
    </nav>
  );
}
