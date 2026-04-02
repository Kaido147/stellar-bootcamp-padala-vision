const TOKEN_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function parseTokenAmountToBaseUnits(amount: string, decimals = 7) {
  const normalized = amount.trim();
  if (!TOKEN_DECIMAL_PATTERN.test(normalized)) {
    throw new Error("Amount must be a positive decimal string.");
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  if (fractionalPart.length > decimals) {
    throw new Error(`Amount cannot have more than ${decimals} decimal places.`);
  }

  const paddedFraction = fractionalPart.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined || "0");
}

export function formatTokenAmountFromBaseUnits(amount: bigint | string, decimals = 7) {
  const normalized = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = normalized < 0n;
  const absolute = negative ? normalized * -1n : normalized;
  const base = absolute.toString().padStart(decimals + 1, "0");
  const whole = base.slice(0, -decimals) || "0";
  const fractional = base.slice(-decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fractional ? `.${fractional}` : ""}`;
}
