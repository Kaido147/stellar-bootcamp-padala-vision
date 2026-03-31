import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProofEvidenceCard } from "./ProofEvidenceCard";

describe("ProofEvidenceCard", () => {
  it("renders the proof image and structured AI analysis", () => {
    render(
      <ProofEvidenceCard
        proof={{
          imageUrl: "https://example.test/proof.jpg",
          storagePath: "proofs/order-1.jpg",
          fileHash: "hash-123",
          contentType: "image/jpeg",
          submittedAt: "2026-03-31T00:00:00.000Z",
          note: "Front desk handoff",
          analysis: {
            analysisStatus: "available",
            summary: "The image appears to show the parcel on a front desk.",
            qualityAssessment: "clear",
            confidenceLabel: "high",
            riskFlags: ["RECIPIENT_NOT_VISIBLE"],
            operatorNotes: "The package is visible, but the recipient is outside the frame.",
            decisionSuggestion: "Compare the proof to the buyer's expected handoff.",
          },
        }}
      />,
    );

    expect(screen.getByAltText(/Proof submitted at/i)).toBeInTheDocument();
    expect(screen.getByText(/The image appears to show the parcel on a front desk/i)).toBeInTheDocument();
    expect(screen.getByText(/The package is visible, but the recipient is outside the frame/i)).toBeInTheDocument();
    expect(screen.getByText(/recipient not visible/i)).toBeInTheDocument();
  });

  it("shows a clear fallback when analysis is unavailable", () => {
    render(
      <ProofEvidenceCard
        proof={{
          imageUrl: null,
          storagePath: "proofs/order-1.jpg",
          fileHash: "hash-123",
          contentType: "image/jpeg",
          submittedAt: "2026-03-31T00:00:00.000Z",
          note: "Front desk handoff",
          analysis: {
            analysisStatus: "unavailable",
            summary: "Gemini analysis is currently unavailable.",
            qualityAssessment: "analysis_unavailable",
            confidenceLabel: "unavailable",
            riskFlags: ["PROOF_ANALYSIS_UNAVAILABLE"],
            operatorNotes: "Review the uploaded image directly.",
            decisionSuggestion: "Inspect the image before continuing.",
          },
        }}
      />,
    );

    expect(screen.getByText(/Gemini proof analysis is currently unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/The proof image could not be rendered here/i)).toBeInTheDocument();
  });
});
