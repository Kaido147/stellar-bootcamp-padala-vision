import type { PropsWithChildren } from "react";

export function PhoneShell({ children }: PropsWithChildren) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="mb-6 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur">
        {children}
      </div>
    </div>
  );
}
