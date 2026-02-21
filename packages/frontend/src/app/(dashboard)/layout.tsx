
import { SidebarNav } from "@/components/dashboard/SidebarNav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav />
      <main className="flex-1 ml-16 overflow-auto min-w-0 bg-background">
        {children}
      </main>
    </div>
  )
}
