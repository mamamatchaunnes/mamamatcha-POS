import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Coffee,
  Tag,
  BarChart3,
  Wallet,
  FileClock,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/dashboard/cashier", label: "POS Kasir", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { to: "/dashboard/orders", label: "Transaksi", icon: Receipt, roles: ["admin", "cashier"] },
  { to: "/dashboard/menu", label: "Menu / Produk", icon: Coffee, roles: ["admin"] },
  { to: "/dashboard/categories", label: "Kategori", icon: Tag, roles: ["admin"] },
  { to: "/dashboard/reports", label: "Laporan", icon: BarChart3, roles: ["admin"] },
  { to: "/dashboard/cashier-sessions", label: "Tutup Kasir", icon: Wallet, roles: ["admin", "cashier"] },
  { to: "/dashboard/audit-logs", label: "Audit Log", icon: FileClock, roles: ["admin"] },
];

const LOGO_URL = "/mamamatcha-logo.png";

function isActiveRoute(pathname: string, routePath: string) {
  if (pathname === routePath) return true;
  if (routePath === "/dashboard") return false;
  return pathname.startsWith(`${routePath}/`);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, role, loading, roleLoaded } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading || (user && !roleLoaded)) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Memuat...
      </div>
    );
  }

  if (!user) return null;

  if (!role) {
    if (typeof window !== "undefined") navigate({ to: "/no-access" });
    return null;
  }

  const items = NAV.filter((item) => item.roles.includes(role));

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-svh w-full overflow-x-hidden bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[min(82vw,16rem)] border-r border-sidebar-border bg-sidebar transition-transform md:w-64 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-svh flex-col">
          <div className="flex items-center gap-3 border-b border-sidebar-border p-4 sm:p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-sidebar-border bg-white">
              <img
                src={LOGO_URL}
                alt="Logo Mamamatcha"
                className="h-full w-full object-contain p-1.5"
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-tight text-sidebar-foreground">
                Mamamatcha
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {items.map((item) => {
              const active = isActiveRoute(pathname, item.to);
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-sidebar-border p-3">
            <div className="px-3 py-2 text-xs">
              <div className="truncate font-semibold text-sidebar-foreground">
                {user.email}
              </div>
              <div className="capitalize text-muted-foreground">{role}</div>
            </div>

            <Button variant="outline" size="sm" onClick={logout} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Keluar
            </Button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Tutup menu"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex min-h-svh min-w-0 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 hover:bg-secondary"
            aria-label="Buka menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <img
              src={LOGO_URL}
              alt="Logo Mamamatcha"
              className="h-7 w-7 shrink-0 rounded-md object-contain"
            />
            <div className="truncate text-sm font-bold text-primary sm:text-base">
              Mamamatcha
            </div>
          </div>

          <div className="w-9" />
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}