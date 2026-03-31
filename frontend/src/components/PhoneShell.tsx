import type { PropsWithChildren } from "react";

export function PhoneShell({ children }: PropsWithChildren) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="surface-panel mb-6 p-5">
        {children}
      </div>
    </div>
  );
}
