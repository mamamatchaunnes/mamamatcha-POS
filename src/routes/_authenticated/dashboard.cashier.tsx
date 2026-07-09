import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { rupiah, generateOrderCode } from "@/lib/format";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, Coffee, ShoppingCart } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";
const LOGO_URL = "/mamamatcha-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/cashier")({
  component: CashierPOS,
});

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category_id: string | null;
  is_available: boolean;
};

type CartItem = {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
};

function CashierPOS() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [generalNote, setGeneralNote] = useState("");
  const [method, setMethod] = useState<"cash" | "qris">("cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("paid");
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("name");

      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");

      return (data ?? []) as Product[];
    },
  });

  const filtered = useMemo(() => {
    return (products ?? []).filter((p) => {
      if (catId && p.category_id !== catId) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, catId, search]);

  const addToCart = (p: Product) => {
    if (!p.is_available) return toast.error(`${p.name} sedang tidak tersedia`);

    setCart((c) => {
      const ex = c.find((i) => i.product_id === p.id);

      if (ex) {
        return c.map((i) =>
          i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }

      return [...c, { product_id: p.id, name: p.name, price: p.price, qty: 1, notes: "" }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((c) =>
      c.flatMap((i) => {
        if (i.product_id !== id) return [i];

        const q = i.qty + delta;

        if (q <= 0) return [];

        return [{ ...i, qty: q }];
      }),
    );
  };

  const removeItem = (id: string) => {
    setCart((c) => c.filter((i) => i.product_id !== id));
  };

  const updateNotes = (id: string, notes: string) => {
    setCart((c) =>
      c.map((i) => (i.product_id === id ? { ...i, notes } : i)),
    );
  };

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const submit = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");

    setSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) throw new Error("Sesi tidak valid");

      const code = generateOrderCode();

      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          order_code: code,
          customer_name: customer || null,
          status: paymentStatus === "paid" ? "completed" : "new",
          payment_status: paymentStatus,
          payment_method: method,
          total_amount: total,
          general_note: generalNote || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (oErr) throw oErr;

      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map((i) => ({
          order_id: order.id,
          product_id: i.product_id,
          product_name: i.name,
          price: i.price,
          quantity: i.qty,
          notes: i.notes || null,
          subtotal: i.price * i.qty,
        })),
      );

      if (iErr) throw iErr;

      if (paymentStatus === "paid") {
        await supabase.from("payments").insert({
          order_id: order.id,
          method,
          amount: total,
          status: "paid",
          paid_at: new Date().toISOString(),
          created_by: user.id,
        });
      }

      await logAudit({
        action: "create_order",
        entity_type: "order",
        entity_id: order.id,
        description: `Buat transaksi ${code} total ${total}`,
      });

      queryClient.invalidateQueries();
      setCart([]);
      setCustomer("");
      setGeneralNote("");
      toast.success(`Transaksi ${code} berhasil dibuat`);
      navigate({ to: "/dashboard/orders" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col overflow-x-hidden lg:h-screen lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 md:p-6 lg:overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">POS Kasir</h1>
          <p className="text-sm text-muted-foreground">
            Pilih produk untuk menambahkan ke keranjang.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CatChip active={catId === null} onClick={() => setCatId(null)}>
            Semua
          </CatChip>

          {categories?.map((c) => (
            <CatChip key={c.id} active={catId === c.id} onClick={() => setCatId(c.id)}>
              {c.name}
            </CatChip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pb-2 min-[430px]:grid-cols-3 md:grid-cols-3 lg:overflow-y-auto lg:pr-1 xl:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={!p.is_available}
              className={cn(
                "min-w-0 rounded-xl border bg-card p-2.5 text-left transition hover:border-primary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:p-3",
              )}
            >
              <div className="mb-2 grid aspect-square place-items-center overflow-hidden rounded-lg bg-secondary">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Coffee className="h-8 w-8 text-primary/60" />
                )}
              </div>

              <div className="line-clamp-2 text-sm font-semibold leading-tight">
                {p.name}
              </div>

              <div className="mt-1 text-sm font-bold text-primary">
                {rupiah(p.price)}
              </div>

              {!p.is_available && (
                <div className="mt-1 text-xs text-destructive">Tidak tersedia</div>
              )}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Tidak ada produk.
            </div>
          )}
        </div>
      </div>

      <aside className="flex min-h-0 flex-col border-t bg-sidebar/40 lg:w-[400px] lg:border-l lg:border-t-0 xl:w-[440px]">
        <div className="flex items-center gap-2 border-b bg-background/50 p-4">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Keranjang</h2>
          <span className="ml-auto text-xs text-muted-foreground">{cart.length} item</span>
        </div>

        <div className="max-h-[50svh] flex-1 space-y-3 overflow-y-auto p-4 lg:max-h-none">
          {cart.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Belum ada item.
            </div>
          )}

          {cart.map((i) => (
            <Card key={i.product_id} className="space-y-2 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{rupiah(i.price)}</div>
                </div>

                <button onClick={() => removeItem(i.product_id)} className="p-1 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => updateQty(i.product_id, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>

                <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>

                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => updateQty(i.product_id, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>

                <span className="ml-auto text-sm font-bold">{rupiah(i.price * i.qty)}</span>
              </div>

              <Input
                value={i.notes}
                onChange={(e) => updateNotes(i.product_id, e.target.value)}
                placeholder="Catatan item (opsional)"
                className="h-8 text-xs"
              />
            </Card>
          ))}
        </div>

        <div className="space-y-3 border-t bg-background p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nama pelanggan (opsional)</Label>
            <Input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Nama pelanggan"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Catatan umum (opsional)</Label>
            <Textarea
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
            <div>
              <Label className="text-xs">Pembayaran</Label>
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  variant={method === "cash" ? "default" : "outline"}
                  onClick={() => setMethod("cash")}
                  className="flex-1"
                >
                  Cash
                </Button>

                <Button
                  size="sm"
                  variant={method === "qris" ? "default" : "outline"}
                  onClick={() => setMethod("qris")}
                  className="flex-1"
                >
                  QRIS
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Status</Label>
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  variant={paymentStatus === "paid" ? "default" : "outline"}
                  onClick={() => setPaymentStatus("paid")}
                  className="flex-1"
                >
                  Lunas
                </Button>

                <Button
                  size="sm"
                  variant={paymentStatus === "unpaid" ? "default" : "outline"}
                  onClick={() => setPaymentStatus("unpaid")}
                  className="flex-1"
                >
                  Belum
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold text-primary sm:text-2xl">
              {rupiah(total)}
            </span>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={submit}
            disabled={submitting || cart.length === 0}
          >
            {submitting ? "Memproses..." : "Buat Transaksi"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}