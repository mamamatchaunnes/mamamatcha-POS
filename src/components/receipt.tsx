import { rupiah, fmtDate } from "@/lib/format";

const LOGO_URL = "/mamamatcha-logo.png";

export type ReceiptOrder = {
  order_code: string;
  customer_name: string | null;
  created_at: string;
  total_amount: number;
  payment_status: string;
  payment_method: string;
  general_note: string | null;
  items: {
    product_name: string;
    price: number;
    quantity: number;
    subtotal: number;
    notes: string | null;
  }[];
};

export function Receipt({ order }: { order: ReceiptOrder }) {
  return (
    <div className="receipt-80mm mx-auto">
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <img
          src={LOGO_URL}
          alt="Logo Mamamatcha"
          style={{
            width: 42,
            height: 42,
            objectFit: "contain",
            display: "block",
            margin: "0 auto 4px auto",
          }}
        />

        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
          Mamamatcha
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div style={{ fontWeight: 700, textAlign: "center", marginBottom: 4 }}>
        STRUK PEMBELIAN
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div>Kode : {order.order_code}</div>
      <div>Tgl  : {fmtDate(order.created_at)}</div>
      {order.customer_name && <div>Nama : {order.customer_name}</div>}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {order.items.map((item, index) => (
        <div key={`${item.product_name}-${index}`} style={{ marginBottom: 5 }}>
          <div style={{ fontWeight: 700 }}>{item.product_name}</div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>
              {item.quantity} x {rupiah(item.price)}
            </span>
            <span>{rupiah(item.subtotal)}</span>
          </div>

          {item.notes && (
            <div style={{ fontStyle: "italic", fontSize: 10 }}>
              * {item.notes}
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span>TOTAL</span>
        <span>{rupiah(order.total_amount)}</span>
      </div>

      <div style={{ marginTop: 4 }}>
        Metode: {order.payment_method.toUpperCase()}
      </div>

      <div>
        Status:{" "}
        {order.payment_status === "paid"
          ? "LUNAS"
          : order.payment_status === "cancelled"
            ? "DIBATALKAN"
            : "BELUM BAYAR"}
      </div>

      {order.general_note && (
        <>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div>Catatan: {order.general_note}</div>
        </>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div style={{ textAlign: "center", fontWeight: 700 }}>
        Terima kasih!
      </div>

      <div style={{ textAlign: "center", fontSize: 10 }}>
        Sampai jumpa lagi
      </div>
    </div>
  );
}
