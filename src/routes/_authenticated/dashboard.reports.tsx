import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rupiah, fmtDate } from "@/lib/format";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/reports")({
  component: ReportsPage,
});

type Period = "daily" | "weekly" | "monthly" | "yearly" | "custom";

const LOGO_URL = "/mamamatcha-logo.png";

function getRange(p: Period, from?: string, to?: string): [Date, Date] {
  const now = new Date();

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (p === "daily") return [start, end];

  if (p === "weekly") {
    start.setDate(start.getDate() - 6);
    return [start, end];
  }

  if (p === "monthly") {
    start.setDate(1);
    return [start, end];
  }

  if (p === "yearly") {
    start.setMonth(0, 1);
    return [start, end];
  }

  if (p === "custom" && from && to) {
    const s = new Date(from);
    s.setHours(0, 0, 0, 0);

    const e = new Date(to);
    e.setHours(23, 59, 59, 999);

    return [s, e];
  }

  return [start, end];
}

function ReportsPage() {
  const { role } = useAuth();

  if (role && role !== "admin") return <Navigate to="/dashboard/cashier" />;

  const [period, setPeriod] = useState<Period>("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [start, end] = useMemo(() => getRange(period, from, to), [period, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", period, from, to],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      const list = orders ?? [];
      const paid = list.filter((o) => o.payment_status === "paid");
      const unpaid = list.filter((o) => o.payment_status === "unpaid");
      const cancelled = list.filter((o) => o.status === "cancelled");

      const omzet = paid.reduce((s, o) => s + o.total_amount, 0);
      const cashTotal = paid
        .filter((o) => o.payment_method === "cash")
        .reduce((s, o) => s + o.total_amount, 0);
      const qrisTotal = paid
        .filter((o) => o.payment_method === "qris")
        .reduce((s, o) => s + o.total_amount, 0);
      const avg = paid.length ? omzet / paid.length : 0;

      const productMap = new Map<string, { name: string; qty: number; revenue: number }>();

      list
        .filter((o) => o.status !== "cancelled")
        .forEach((o) =>
          (o.order_items ?? []).forEach(
            (i: { product_name: string; quantity: number; subtotal: number }) => {
              const cur = productMap.get(i.product_name) ?? {
                name: i.product_name,
                qty: 0,
                revenue: 0,
              };

              cur.qty += i.quantity;
              cur.revenue += i.subtotal;
              productMap.set(i.product_name, cur);
            },
          ),
        );

      const top = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

      return { list, paid, unpaid, cancelled, omzet, cashTotal, qrisTotal, avg, top };
    },
  });

  const print = () => window.print();
  const periodLabel = `${fmtDate(start.toISOString())} - ${fmtDate(end.toISOString())}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-5 md:p-8">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            Laporan Penjualan
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Ringkasan penjualan Mamamatcha
          </p>
        </div>

        <Button onClick={print} className="w-full sm:w-auto">
          <Printer className="mr-2 h-4 w-4" />
          Cetak / Simpan PDF
        </Button>
      </div>

      <Card className="no-print p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Periode</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Harian</SelectItem>
                <SelectItem value="weekly">Mingguan</SelectItem>
                <SelectItem value="monthly">Bulanan</SelectItem>
                <SelectItem value="yearly">Tahunan</SelectItem>
                <SelectItem value="custom">Kustom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label>Dari</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Sampai</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </Card>

      <div id="report-print">
        <div className="hidden print:block">
          <div className="print-header">
            <img
              src={LOGO_URL}
              alt="Logo Mamamatcha"
              className="print-logo"
            />

            <div>
              <div className="print-title">Mamamatcha</div>
              <div className="print-subtitle">Laporan Penjualan POS Kasir</div>
              <div className="print-subtitle">Periode: {periodLabel}</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div>Memuat...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Omzet Lunas" value={rupiah(data?.omzet)} highlight />
              <Stat label="Total Transaksi" value={String(data?.list.length ?? 0)} />
              <Stat label="Transaksi Lunas" value={String(data?.paid.length ?? 0)} />
              <Stat label="Rata-rata Nilai" value={rupiah(data?.avg)} />
              <Stat label="Belum Bayar" value={String(data?.unpaid.length ?? 0)} />
              <Stat label="Dibatalkan" value={String(data?.cancelled.length ?? 0)} />
              <Stat label="Total Cash" value={rupiah(data?.cashTotal)} />
              <Stat label="Total QRIS" value={rupiah(data?.qrisTotal)} />
            </div>

            <Card className="mt-4 overflow-hidden p-4 sm:p-5">
              <h2 className="mb-3 font-semibold">Produk Terlaris</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2">Produk</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Pendapatan</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data?.top.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2">{p.name}</td>
                        <td className="py-2 text-right">{p.qty}</td>
                        <td className="py-2 text-right">{rupiah(p.revenue)}</td>
                      </tr>
                    ))}

                    {data?.top.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-center text-muted-foreground">
                          Belum ada data produk.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="mt-4 overflow-hidden p-4 sm:p-5">
              <h2 className="mb-3 font-semibold">Daftar Transaksi</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2">Kode</th>
                      <th className="pb-2">Tgl</th>
                      <th className="pb-2">Pelanggan</th>
                      <th className="pb-2">Metode</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data?.list.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{o.order_code}</td>
                        <td className="py-2 text-xs">{fmtDate(o.created_at)}</td>
                        <td className="py-2">{o.customer_name || "-"}</td>
                        <td className="py-2 text-xs uppercase">{o.payment_method}</td>
                        <td className="py-2 text-xs">
                          {o.payment_status === "paid"
                            ? "Lunas"
                            : o.payment_status === "unpaid"
                              ? "Belum"
                              : "Batal"}
                        </td>
                        <td className="py-2 text-right">{rupiah(o.total_amount)}</td>
                      </tr>
                    ))}

                    {data?.list.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-3 text-center text-muted-foreground">
                          Belum ada transaksi pada periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 sm:p-5 ${highlight ? "bg-primary/10 border-primary/30" : ""}`}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xl font-bold leading-tight sm:text-2xl">
        {value}
      </div>
    </Card>
  );
}