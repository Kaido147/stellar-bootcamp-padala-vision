export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function formatRelativeCountdown(target?: string | null) {
  if (!target) {
    return "Not scheduled";
  }

  const deltaMs = new Date(target).getTime() - Date.now();
  const sign = deltaMs >= 0 ? "in" : "ago";
  const absolute = Math.abs(deltaMs);
  const hours = Math.floor(absolute / (1000 * 60 * 60));
  const minutes = Math.floor((absolute % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}m ${sign}`;
  }

  return `${hours}h ${minutes}m ${sign}`;
}

export function shortenAddress(value?: string | null) {
  if (!value) {
    return "Not connected";
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function humanizeKey(value: string) {
  return value.replace(/_/g, " ");
}
