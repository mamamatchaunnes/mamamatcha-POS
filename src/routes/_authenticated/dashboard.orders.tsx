import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rupiah, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Search, Printer, Check, X } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { Receipt, type ReceiptOrder } from "@/components/receipt";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [payStatus, setPayStatus] = useState("all");
  const [payMethod, setPayMethod] = useState("all");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<ReceiptOrder | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", q, payStatus, payMethod, date],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (payStatus !== "all") {
        query = query.eq(
          "payment_status",
          payStatus as "paid" | "unpaid" | "cancelled",
        );
      }

      if (payMethod !== "all") {
        query = query.eq("payment_method", payMethod as "cash" | "qris");
      }

      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        query = query
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      let rows = data ?? [];

      if (q) {
        const s = q.toLowerCase();

        rows = rows.filter(
          (o) =>
            o.order_code.toLowerCase().includes(s) ||
            (o.customer_name ?? "").toLowerCase().includes(s) ||
            (o.order_items ?? []).some((i: { product_name: string }) =>
              i.product_name.toLowerCase().includes(s),
            ),
        );
      }

      return rows;
    },
  });

  const markPaid = async (o: {
    id: string;
    order_code: string;
    total_amount: number;
    payment_method: string;
  }) => {
    const { data: u } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "paid", status: "completed" })
      .eq("id", o.id);

    if (error) return toast.error(error.message);

    await supabase.from("payments").insert({
      order_id: o.id,
      method: o.payment_method as "cash" | "qris",
      amount: o.total_amount,
      status: "paid",
      paid_at: new Date().toISOString(),
      created_by: u.user?.id,
    });

    await logAudit({
      action: "mark_paid",
      entity_type: "order",
      entity_id: o.id,
      description: `Tandai lunas ${o.order_code}`,
    });

    toast.success("Transaksi ditandai lunas");
    qc.invalidateQueries();
  };

  const cancel = async (o: { id: string; order_code: string }) => {
    if (!confirm(`Batalkan transaksi ${o.order_code}?`)) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", payment_status: "cancelled" })
      .eq("id", o.id);

    if (error) return toast.error(error.message);

    await logAudit({
      action: "cancel_order",
      entity_type: "order",
      entity_id: o.id,
      description: `Batal ${o.order_code}`,
    });

    toast.success("Transaksi dibatalkan");
    qc.invalidateQueries();
  };

  const print = () => {
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="no-print mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-5 md:p-8">
      <div>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Transaksi</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Daftar semua transaksi kasir.
        </p>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode, pelanggan, produk..."
              className="pl-9"
            />
          </div>

          <Select value={payStatus} onValueChange={setPayStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="paid">Lunas</SelectItem>
              <SelectItem value="unpaid">Belum bayar</SelectItem>
              <SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>

          <Select value={payMethod} onValueChange={setPayMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua metode</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="qris">QRIS</SelectItem>
            </SelectContent>
          </Select>

          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      <div className="space-y-3 md:hidden">
        {isLoading && (
          <Card className="p-5 text-center text-sm text-muted-foreground">
            Memuat...
          </Card>
        )}

        {!isLoading && (data ?? []).length === 0 && (
          <Card className="p-5 text-center text-sm text-muted-foreground">
            Tidak ada data.
          </Card>
        )}

        {data?.map((o) => {
          const totalQty = (o.order_items ?? []).reduce(
            (sum: number, item: { quantity: number }) => sum + item.quantity,
            0,
          );

          return (
            <Card key={o.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-all font-mono text-xs font-semibold">
                    {o.order_code}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(o.created_at)}
                  </div>
                </div>

                <div className="shrink-0 text-right font-bold text-primary">
                  {rupiah(o.total_amount)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Pelanggan</div>
                  <div className="font-medium">{o.customer_name || "-"}</div>
                </div>

                <div>
                  <div className="text-muted-foreground">Item</div>
                  <div className="font-medium">
                    {(o.order_items ?? []).length} item · {totalQty} cup
                  </div>
                </div>

                <div>
                  <div className="text-muted-foreground">Pembayaran</div>
                  <div className="font-medium uppercase">{o.payment_method}</div>
                </div>

                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div
                    className={cn(
                      "font-medium",
                      o.payment_status === "paid" && "text-primary",
                      o.payment_status === "unpaid" && "text-amber-600",
                      o.payment_status === "cancelled" && "text-destructive",
                    )}
                  >
                    {o.payment_status === "paid"
                      ? "Lunas"
                      : o.payment_status === "unpaid"
                        ? "Belum bayar"
                        : "Dibatalkan"}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-1 border-t pt-2">
                {o.payment_status === "unpaid" && (
                  <Button size="sm" variant="outline" onClick={() => markPaid(o)}>
                    <Check className="mr-1 h-4 w-4 text-primary" />
                    Lunas
                  </Button>
                )}

                {o.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => cancel(o)}>
                    <X className="mr-1 h-4 w-4 text-destructive" />
                    Batal
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelected({
                      order_code: o.order_code,
                      customer_name: o.customer_name,
                      created_at: o.created_at,
                      total_amount: o.total_amount,
                      payment_status: o.payment_status,
                      payment_method: o.payment_method,
                      general_note: o.general_note,
                      items: o.order_items ?? [],
                    })
                  }
                >
                  <Printer className="mr-1 h-4 w-4" />
                  Struk
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-3">Kode</th>
                <th className="p-3">Tanggal</th>
                <th className="p-3">Pelanggan</th>
                <th className="p-3">Item</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Pembayaran</th>
                <th className="p-3">Status</th>
                <th className="p-3">Aksi</th>
              </tr>
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Memuat...
                  </td>
                </tr>
              )}

              {!isLoading && (data ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Tidak ada data.
                  </td>
                </tr>
              )}

              {data?.map((o) => (
                <tr key={o.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-mono text-xs">{o.order_code}</td>
                  <td className="p-3 text-xs">{fmtDate(o.created_at)}</td>
                  <td className="p-3">
                    {o.customer_name || <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {(o.order_items ?? []).length} item ·{" "}
                    {(o.order_items ?? []).reduce(
                      (s: number, i: { quantity: number }) => s + i.quantity,
                      0,
                    )}{" "}
                    cup
                  </td>
                  <td className="p-3 text-right font-semibold">{rupiah(o.total_amount)}</td>
                  <td className="p-3">
                    <span className="text-xs font-medium uppercase">{o.payment_method}</span>
                    <div
                      className={cn(
                        "text-xs",
                        o.payment_status === "paid" && "text-primary",
                        o.payment_status === "unpaid" && "text-amber-600",
                        o.payment_status === "cancelled" && "text-destructive",
                      )}
                    >
                      {o.payment_status === "paid"
                        ? "Lunas"
                        : o.payment_status === "unpaid"
                          ? "Belum bayar"
                          : "Dibatalkan"}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        o.status === "new" && "bg-accent",
                        o.status === "completed" && "bg-primary/15 text-primary",
                        o.status === "cancelled" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      {o.status === "new"
                        ? "Baru"
                        : o.status === "completed"
                          ? "Selesai"
                          : "Dibatalkan"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {o.payment_status === "unpaid" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Tandai lunas"
                          onClick={() => markPaid(o)}
                        >
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                      )}

                      {o.status !== "cancelled" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Batalkan"
                          onClick={() => cancel(o)}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        title="Cetak struk"
                        onClick={() =>
                          setSelected({
                            order_code: o.order_code,
                            customer_name: o.customer_name,
                            created_at: o.created_at,
                            total_amount: o.total_amount,
                            payment_status: o.payment_status,
                            payment_method: o.payment_method,
                            general_note: o.general_note,
                            items: o.order_items ?? [],
                          })
                        }
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="no-print">Pratinjau Struk</DialogTitle>
          </DialogHeader>

          {selected && (
            <>
              <div id="print-area">
                <Receipt order={selected} />
              </div>

              <div className="no-print flex justify-end gap-2">
                <Button onClick={print}>
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}