
import { SidebarNav } from "@/components/dashboard/SidebarNav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <main className="flex-1 ml-16 overflow-auto">
        {children}
      </main>
    </div>
  )
}
