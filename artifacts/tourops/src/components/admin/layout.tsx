import { ReactNode } from "react";

export function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6 p-6">{children}</div>;
}
