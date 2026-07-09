import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { rupiah, fmtDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { Receipt, DollarSign, Smartphone, Coffee, TrendingUp, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { role } = useAuth();

  if (role === "cashier") return <Navigate to="/dashboard/cashier" />;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_code, customer_name, total_amount, payment_status, payment_method, status, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      const paidOrders = (orders ?? []).filter((o) => o.payment_status === "paid");
      const totalSales = paidOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const cashCount = paidOrders.filter((o) => o.payment_method === "cash").length;
      const qrisCount = paidOrders.filter((o) => o.payment_method === "qris").length;

      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, quantity, order_id, orders!inner(created_at, status)")
        .gte("orders.created_at", start.toISOString())
        .lte("orders.created_at", end.toISOString())
        .neq("orders.status", "cancelled");

      const totalItems = (items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);

      const productMap = new Map<string, number>();

      (items ?? []).forEach((i) => {
        productMap.set(i.product_name, (productMap.get(i.product_name) ?? 0) + i.quantity);
      });

      const topProduct = [...productMap.entries()].sort((a, b) => b[1] - a[1])[0];

      return {
        totalTx: (orders ?? []).length,
        totalSales,
        cashCount,
        qrisCount,
        topProduct: topProduct ? { name: topProduct[0], qty: topProduct[1] } : null,
        totalItems,
        recent: (orders ?? []).slice(0, 6),
      };
    },
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-5 md:p-8">
      <div>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
          Ringkasan Hari Ini
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Data penjualan real-time Mamamatcha
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Memuat data...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            <StatCard icon={<Receipt />} label="Total Transaksi" value={String(data?.totalTx ?? 0)} tint="matcha" />
            <StatCard icon={<TrendingUp />} label="Penjualan Lunas" value={rupiah(data?.totalSales)} tint="matcha" />
            <StatCard icon={<DollarSign />} label="Transaksi Cash" value={String(data?.cashCount ?? 0)} />
            <StatCard icon={<Smartphone />} label="Transaksi QRIS" value={String(data?.qrisCount ?? 0)} />
            <StatCard
              icon={<Coffee />}
              label="Produk Terlaris"
              value={data?.topProduct?.name ?? "-"}
              sub={data?.topProduct ? `${data.topProduct.qty} cup` : ""}
            />
            <StatCard icon={<ShoppingBag />} label="Total Item Terjual" value={String(data?.totalItems ?? 0)} />
          </div>

          <Card className="p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">Transaksi Terakhir</h2>

            <div className="divide-y">
              {(data?.recent ?? []).length === 0 && (
                <div className="py-4 text-sm text-muted-foreground">
                  Belum ada transaksi hari ini.
                </div>
              )}

              {data?.recent.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div>
                    <div className="font-medium">{o.order_code}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.customer_name || "Tanpa nama"} · {fmtDate(o.created_at)}
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="font-semibold">{rupiah(o.total_amount)}</div>
                    <div className="text-xs">
                      <span className="uppercase text-primary">{o.payment_method}</span>{" "}
                      ·{" "}
                      <span className={o.payment_status === "paid" ? "text-primary" : "text-amber-600"}>
                        {o.payment_status === "paid"
                          ? "Lunas"
                          : o.payment_status === "cancelled"
                            ? "Batal"
                            : "Belum bayar"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint?: "matcha";
}) {
  return (
    <Card className={`p-4 sm:p-5 ${tint === "matcha" ? "bg-primary/5 border-primary/20" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 break-words text-xl font-bold leading-tight sm:text-2xl">
            {value}
          </div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>

        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tint === "matcha"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
            }`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}