import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TxProgressCard } from "./TxProgressCard";

describe("TxProgressCard", () => {
  it("shows hash and failure state", () => {
    render(<TxProgressCard error="release failed" stage="Confirming" txHash="abc123" />);

    expect(screen.getByText("release failed")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });
});
