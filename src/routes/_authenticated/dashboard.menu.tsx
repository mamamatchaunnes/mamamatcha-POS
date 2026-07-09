import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { rupiah } from "@/lib/format";
import { Plus, Edit, Archive, Coffee } from "lucide-react";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/dashboard/menu")({
  component: MenuPage,
});

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  is_available: boolean;
  is_active: boolean;
};

function MenuPage() {
  const { role } = useAuth();

  if (role && role !== "admin") {
    return <Navigate to="/dashboard/cashier" />;
  }

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () =>
      (await supabase.from("categories").select("*").order("name")).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["products-all"],
    queryFn: async () =>
      ((await supabase.from("products").select("*").order("name")).data ?? []) as Product[],
  });

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setOpen(true);
  };

  const toggleAvailable = async (product: Product) => {
    const { error } = await supabase
      .from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await logAudit({
      action: "toggle_available",
      entity_type: "product",
      entity_id: product.id,
      description: `${product.name} → ${!product.is_available ? "tersedia" : "tidak tersedia"
        }`,
    });

    qc.invalidateQueries();
  };

  const archive = async (product: Product) => {
    if (!confirm(`Arsipkan ${product.name}? Produk tidak akan tampil di POS.`)) {
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", product.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await logAudit({
      action: "archive_product",
      entity_type: "product",
      entity_id: product.id,
      description: `Arsip ${product.name}`,
    });

    toast.success("Produk diarsipkan");
    qc.invalidateQueries();
  };

  const unarchive = async (product: Product) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: true })
      .eq("id", product.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Produk diaktifkan kembali");
    qc.invalidateQueries();
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-5 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            Menu / Produk
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Kelola produk minuman & snack.
          </p>
        </div>

        <Button onClick={openNew} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Tambah Produk
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {products?.map((product) => (
          <Card
            key={product.id}
            className={`flex min-w-0 gap-3 p-3 sm:p-4 ${!product.is_active ? "opacity-60" : ""
              }`}
          >
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary sm:h-24 sm:w-24">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Coffee className="h-8 w-8 text-primary/60" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 font-semibold leading-tight">
                {product.name}
              </div>

              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {categories?.find((category) => category.id === product.category_id)?.name ?? "-"}
              </div>

              <div className="mt-1 font-bold text-primary">
                {rupiah(product.price)}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Switch
                  checked={product.is_available}
                  onCheckedChange={() => toggleAvailable(product)}
                />
                <span className="text-xs text-muted-foreground">
                  {product.is_available ? "Tersedia" : "Habis"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(product)}>
                <Edit className="h-4 w-4" />
              </Button>

              {product.is_active ? (
                <Button size="icon" variant="ghost" onClick={() => archive(product)}>
                  <Archive className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => unarchive(product)}>
                  Aktifkan
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        categories={categories ?? []}
        onSaved={() => qc.invalidateQueries()}
      />
    </div>
  );
}

function ProductDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  return <ProductDialogInner key={props.editing?.id ?? "new"} {...props} />;
}

function ProductDialogInner({
  open,
  onOpenChange,
  editing,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [price, setPrice] = useState(editing?.price ?? 0);
  const [image, setImage] = useState(editing?.image_url ?? "");
  const [catId, setCatId] = useState(editing?.category_id ?? "");
  const [available, setAvailable] = useState(editing?.is_available ?? true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Nama wajib diisi");
      return;
    }

    if (price <= 0) {
      toast.error("Harga harus lebih dari 0");
      return;
    }

    setSaving(true);

    try {
      const oldPrice = editing?.price;

      const payload = {
        name: name.trim(),
        description: desc.trim() || null,
        price,
        image_url: image.trim() || null,
        category_id: catId || null,
        is_available: available,
      };

      if (editing) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;

        if (oldPrice !== undefined && oldPrice !== price) {
          await logAudit({
            action: "change_price",
            entity_type: "product",
            entity_id: editing.id,
            description: `${name}: ${oldPrice} → ${price}`,
          });
        }

        await logAudit({
          action: "edit_product",
          entity_type: "product",
          entity_id: editing.id,
          description: name,
        });
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        await logAudit({
          action: "create_product",
          entity_type: "product",
          entity_id: data.id,
          description: name,
        });
      }

      toast.success("Produk disimpan");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || "Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      toast.error("Format foto harus JPG, PNG, atau WebP");
      return;
    }

    if (file.size > maxSize) {
      toast.error("Ukuran foto maksimal 5MB");
      return;
    }

    setUploading(true);

    try {
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const ext = rawExt === "jpeg" ? "jpg" : rawExt;
      const path = `products/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        const message = uploadError.message?.toLowerCase() ?? "";

        if (message.includes("bucket not found")) {
          throw new Error("Bucket product-images belum dibuat di Supabase Storage.");
        }

        throw uploadError;
      }

      const { data, error: signedUrlError } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);

      if (signedUrlError) throw signedUrlError;

      if (!data?.signedUrl) {
        throw new Error("Gagal membuat URL foto produk.");
      }

      setImage(data.signedUrl);
      toast.success("Foto produk berhasil diupload");
    } catch (error) {
      toast.error((error as Error).message || "Gagal upload foto produk");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contoh: Choco Matcha"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Deskripsi</Label>
            <Textarea
              value={desc}
              onChange={(event) => setDesc(event.target.value)}
              rows={2}
              placeholder="Deskripsi singkat produk"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Harga (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={catId} onValueChange={setCatId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>

                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Foto Produk</Label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="URL foto atau upload"
              />

              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) uploadFile(file);

                  event.target.value = "";
                }}
                className="sm:max-w-[150px]"
              />
            </div>

            {uploading && (
              <div className="text-xs text-muted-foreground">Mengupload foto...</div>
            )}

            {image && (
              <img
                src={image}
                alt="Preview produk"
                className="h-24 w-24 rounded-lg border object-cover"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={available} onCheckedChange={setAvailable} />
            <Label>Tersedia</Label>
          </div>

          <Button className="w-full" onClick={save} disabled={saving || uploading}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}