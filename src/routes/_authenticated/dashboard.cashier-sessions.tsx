import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { rupiah, fmtDate } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/cashier-sessions")({
  component: SessionsPage,
});

type Session = {
  id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  cash_system_total: number;
  qris_system_total: number;
  cash_physical_total: number;
  cash_difference: number;
  total_orders: number;
  note: string | null;
  status: string;
};

const LOGO_URL = "/mamamatcha-logo.png";

function SessionsPage() {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [physical, setPhysical] = useState(0);

  const { data: openSession } = useQuery({
    queryKey: ["open-session"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();

      if (!u.user) return null;

      const { data } = await supabase
        .from("cashier_sessions")
        .select("*")
        .eq("cashier_id", u.user.id)
        .eq("status", "open")
        .maybeSingle();

      return (data ?? null) as Session | null;
    },
  });

  const { data: liveTotals } = useQuery({
    enabled: !!openSession,
    queryKey: ["session-totals", openSession?.id],
    queryFn: async () => {
      if (!openSession) return null;

      const { data: orders } = await supabase
        .from("orders")
        .select("total_amount, payment_status, payment_method, status")
        .gte("created_at", openSession.opened_at)
        .eq("created_by", openSession.cashier_id);

      const list = orders ?? [];
      const paid = list.filter((o) => o.payment_status === "paid");

      return {
        cash: paid
          .filter((o) => o.payment_method === "cash")
          .reduce((s, o) => s + o.total_amount, 0),
        qris: paid
          .filter((o) => o.payment_method === "qris")
          .reduce((s, o) => s + o.total_amount, 0),
        totalPaid: paid.reduce((s, o) => s + o.total_amount, 0),
        totalOrders: list.length,
        cancelled: list.filter((o) => o.status === "cancelled").length,
      };
    },
  });

  const { data: history } = useQuery({
    queryKey: ["session-history"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();

      if (!u.user) return [];

      const { data } = await supabase
        .from("cashier_sessions")
        .select("*")
        .eq("cashier_id", u.user.id)
        .order("opened_at", { ascending: false })
        .limit(20);

      return (data ?? []) as Session[];
    },
  });

  const open = async () => {
    const { data: u } = await supabase.auth.getUser();

    if (!u.user) return;

    const { error } = await supabase
      .from("cashier_sessions")
      .insert({ cashier_id: u.user.id, status: "open" });

    if (error) return toast.error(error.message);

    toast.success("Shift dibuka");
    qc.invalidateQueries();
  };

  const close = async () => {
    if (!openSession || !liveTotals) return;

    const diff = physical - liveTotals.cash;

    const { error } = await supabase
      .from("cashier_sessions")
      .update({
        closed_at: new Date().toISOString(),
        cash_system_total: liveTotals.cash,
        qris_system_total: liveTotals.qris,
        cash_physical_total: physical,
        cash_difference: diff,
        total_orders: liveTotals.totalOrders,
        note: note || null,
        status: "closed",
      })
      .eq("id", openSession.id);

    if (error) return toast.error(error.message);

    await logAudit({
      action: "close_session",
      entity_type: "cashier_session",
      entity_id: openSession.id,
      description: `Selisih ${diff}`,
    });

    toast.success("Kasir ditutup");
    setNote("");
    setPhysical(0);
    qc.invalidateQueries();
  };

  return (
    <div
      id="cashier-session-print"
      className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-5 md:p-8"
    >
      <div className="hidden print:block">
        <div className="print-header">
          <img
            src={LOGO_URL}
            alt="Logo Mamamatcha"
            className="print-logo"
          />

          <div>
            <div className="print-title">Mamamatcha</div>
            <div className="print-subtitle">Laporan Tutup Kasir POS</div>
            <div className="print-subtitle">
              Dicetak dari sistem mamamatcha.unnes
            </div>
          </div>
        </div>
      </div>

      <div className="no-print">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
          Tutup Kasir
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Rekap shift kasir & selisih cash.
        </p>
      </div>

      {!openSession ? (
        <Card className="no-print space-y-3 p-5 text-center sm:p-6">
          <p>Belum ada shift terbuka.</p>
          <Button onClick={open}>Buka Shift Baru</Button>
        </Card>
      ) : (
        <Card className="no-print space-y-4 p-4 sm:p-6">
          <div className="text-sm text-muted-foreground">
            Shift dibuka {fmtDate(openSession.opened_at)}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Info label="Total Cash" value={rupiah(liveTotals?.cash)} />
            <Info label="Total QRIS" value={rupiah(liveTotals?.qris)} />
            <Info label="Total Lunas" value={rupiah(liveTotals?.totalPaid)} highlight />
            <Info
              label="Transaksi"
              value={String(liveTotals?.totalOrders ?? 0)}
              sub={`${liveTotals?.cancelled ?? 0} batal`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Uang cash fisik (Rp)</Label>
              <Input
                type="number"
                value={physical}
                onChange={(e) => setPhysical(Number(e.target.value))}
              />

              {liveTotals && (
                <div className="mt-1 text-xs">
                  Selisih:{" "}
                  <span
                    className={
                      physical - liveTotals.cash === 0
                        ? "text-primary"
                        : "text-destructive"
                    }
                  >
                    {rupiah(physical - liveTotals.cash)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          </div>

          <Button onClick={close} className="w-full">
            Tutup Shift
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4">
          <h2 className="font-semibold">Riwayat Shift</h2>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="no-print"
          >
            <Printer className="mr-2 h-4 w-4" />
            Cetak
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-3">Dibuka</th>
                <th className="p-3">Ditutup</th>
                <th className="p-3 text-right">Cash Sistem</th>
                <th className="p-3 text-right">Cash Fisik</th>
                <th className="p-3 text-right">Selisih</th>
                <th className="p-3 text-right">QRIS</th>
                <th className="p-3">Order</th>
              </tr>
            </thead>

            <tbody>
              {history?.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 text-xs">{fmtDate(s.opened_at)}</td>
                  <td className="p-3 text-xs">
                    {s.closed_at ? fmtDate(s.closed_at) : "-"}
                  </td>
                  <td className="p-3 text-right">{rupiah(s.cash_system_total)}</td>
                  <td className="p-3 text-right">{rupiah(s.cash_physical_total)}</td>
                  <td
                    className={`p-3 text-right ${s.cash_difference === 0 ? "" : "text-destructive"
                      }`}
                  >
                    {rupiah(s.cash_difference)}
                  </td>
                  <td className="p-3 text-right">{rupiah(s.qris_system_total)}</td>
                  <td className="p-3">{s.total_orders}</td>
                </tr>
              ))}

              {history?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Belum ada riwayat shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "bg-primary/10 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}