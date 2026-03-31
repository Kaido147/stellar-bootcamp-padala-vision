import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NetworkMismatchBanner } from "./NetworkMismatchBanner";

vi.mock("../hooks/useWallet", () => ({
  useWallet: vi.fn(() => ({
    networkPassphrase: "Wrong Network",
    expectedNetworkPassphrase: "Test SDF Network ; September 2015",
  })),
}));

describe("NetworkMismatchBanner", () => {
  it("renders wrong and expected network values", () => {
    render(
      <MemoryRouter>
        <NetworkMismatchBanner />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("network-mismatch-banner")).toBeInTheDocument();
    expect(screen.getByText(/Wrong Network/)).toBeInTheDocument();
    expect(screen.getByText(/Test SDF Network/)).toBeInTheDocument();
  });
});
