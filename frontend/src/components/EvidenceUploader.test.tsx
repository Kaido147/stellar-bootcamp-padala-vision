import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EvidenceUploader } from "./EvidenceUploader";

describe("EvidenceUploader", () => {
  it("passes selected files to the callback", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<EvidenceUploader file={null} onSelect={onSelect} previewUrl={null} progress={0} />);

    await user.click(screen.getByRole("button", { name: "Select image" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["hello"], "proof.jpg", { type: "image/jpeg" }));

    expect(onSelect).toHaveBeenCalled();
  });
});
