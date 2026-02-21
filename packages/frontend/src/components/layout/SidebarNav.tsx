import { NavLink } from "react-router-dom";
import { BarChart3, Database, HelpCircle, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";

const navItems = [
  { to: "/trader", label: "Trader Terminal", icon: LayoutDashboard },
  { to: "/issuer", label: "Issuer Portal", icon: ShieldCheck },
  { to: "", label: "Network Explorer", icon: Database, disabled: true },
  { to: "", label: "Analytics Hub", icon: BarChart3, disabled: true },
];

const bottomItems = [
  { label: "Global Settings", icon: Settings },
  { label: "Support", icon: HelpCircle },
];

export function SidebarNav() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" />
        <div>
          <p className="sidebar-brand-title">Conduit</p>
          <p className="sidebar-brand-subtitle">Energy RWA Ops</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          item.disabled ? (
            <button key={item.label} type="button" className="sidebar-nav-link sidebar-nav-link-disabled">
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "sidebar-nav-link sidebar-nav-link-active" : "sidebar-nav-link"
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        ))}
      </nav>

      <div className="sidebar-bottom">
        {bottomItems.map((item) => (
          <button key={item.label} type="button" className="sidebar-nav-link sidebar-nav-link-muted">
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" className="sidebar-nav-link sidebar-nav-link-danger">
          <LogOut size={16} />
          <span>Disconnect</span>
        </button>
      </div>
    </aside>
  );
}
