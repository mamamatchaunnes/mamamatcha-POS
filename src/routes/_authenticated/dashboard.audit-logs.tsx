import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/audit-logs")({
  component: AuditPage,
});

function AuditPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/dashboard/cashier" />;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [],
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Catatan aktivitas penting.</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left"><th className="p-3">Waktu</th><th className="p-3">User</th><th className="p-3">Aksi</th><th className="p-3">Target</th><th className="p-3">Deskripsi</th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Memuat...</td></tr>}
              {data?.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="p-3 text-xs">{l.user_email}</td>
                  <td className="p-3"><span className="text-xs bg-secondary px-2 py-0.5 rounded">{l.action}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{l.entity_type ?? "-"}</td>
                  <td className="p-3">{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
