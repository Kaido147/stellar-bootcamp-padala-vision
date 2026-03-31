import { useState } from "react";
import FreighterApi from "@stellar/freighter-api";

declare global {
  interface Window {
    freighterApi?: {
      getAddress: () => Promise<{ address: string } | string>;
    };
  }
}

export function useWallet() {
  const [address, setAddress] = useState("");

  async function connectWallet() {
    try {
      const access = await FreighterApi.requestAccess();
      if (!access.error && access.address) {
        setAddress(access.address);
        return;
      }
    } catch {
      // Fall through to legacy detection below.
    }

    if (window.freighterApi?.getAddress) {
      try {
        const result = await window.freighterApi.getAddress();
        setAddress(typeof result === "string" ? result : result.address);
        return;
      } catch {
        // Fall through to demo prompt if legacy access also fails.
      }
    }

    const fallback = window.prompt(
      "Freighter was not detected or did not grant access. Paste a demo wallet address only if you want local fallback mode:",
    );
    if (fallback) {
      setAddress(fallback);
    }
  }

  return {
    address,
    connectWallet,
    setAddress,
  };
}
