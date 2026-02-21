
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, ShieldCheck, Database, Settings, BarChart3, HelpCircle, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "Trader Terminal", icon: LayoutDashboard, href: "/terminal" },
  { label: "Issuer Portal", icon: ShieldCheck, href: "/issuer" },
  { label: "Network Explorer", icon: Database, iconColor: "text-muted-foreground", disabled: true },
  { label: "Analytics Hub", icon: BarChart3, iconColor: "text-muted-foreground", disabled: true },
]

const BOTTOM_ITEMS = [
  { label: "Global Settings", icon: Settings },
  { label: "Support", icon: HelpCircle },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <div className="w-16 hover:w-64 group/sidebar transition-all duration-300 h-screen bg-sidebar border-r border-muted/10 flex flex-col z-50 fixed left-0 top-0">
      <div className="p-4 flex items-center justify-center group-hover/sidebar:justify-start transition-all overflow-hidden h-16">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <div className="w-4 h-4 bg-sidebar rounded-sm rotate-45"></div>
        </div>
        <span className="ml-3 font-headline font-bold text-lg opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap">
          Conduit<span className="text-primary">Terminal</span>
        </span>
      </div>

      <div className="flex-1 px-3 mt-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.label}
              href={item.href || "#"}
              className={cn(
                "flex items-center justify-center group-hover/sidebar:justify-start p-2 rounded-lg transition-all relative min-h-10",
                item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-primary/10",
                isActive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex shrink-0 w-10 h-10 items-center justify-center" aria-hidden>
                <Icon className={cn("w-5 h-5", item.iconColor, isActive && "text-primary")} />
              </span>
              <span className="ml-4 text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 top-0 h-full w-1 bg-primary rounded-r" aria-hidden />
              )}
            </Link>
          )
        })}
      </div>

      <div className="px-3 pb-6 space-y-2">
        <div className="h-px bg-muted/10 mx-2 mb-4" />
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              className="w-full flex items-center justify-center group-hover/sidebar:justify-start p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all min-h-10"
            >
              <span className="flex shrink-0 w-10 h-10 items-center justify-center" aria-hidden>
                <Icon className="w-5 h-5" />
              </span>
              <span className="ml-4 text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
                {item.label}
              </span>
            </button>
          )
        })}
        <button type="button" className="w-full flex items-center justify-center group-hover/sidebar:justify-start p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-all min-h-10 mt-2">
          <span className="flex shrink-0 w-10 h-10 items-center justify-center" aria-hidden>
            <LogOut className="w-5 h-5" />
          </span>
          <span className="ml-4 text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
            Disconnect
          </span>
        </button>
      </div>
    </div>
  )
}
