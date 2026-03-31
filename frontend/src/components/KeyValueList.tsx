export function KeyValueList({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-sand/70 p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
