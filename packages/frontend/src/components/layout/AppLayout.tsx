import type { PropsWithChildren } from "react";
import { SidebarNav } from "./SidebarNav";

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="app-main">{children}</main>
    </div>
  );
}
