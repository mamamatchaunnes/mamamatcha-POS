import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  ),
});
