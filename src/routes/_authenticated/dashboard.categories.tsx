import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/categories")({
  component: CatPage,
});

type Cat = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

function CatPage() {
  const { role } = useAuth();

  if (role && role !== "admin") return <Navigate to="/dashboard/cashier" />;

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const { data } = useQuery({
    queryKey: ["categories-manage"],
    queryFn: async () =>
      ((await supabase.from("categories").select("*").order("name")).data ?? []) as Cat[],
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setDesc("");
    setOpen(true);
  };

  const openEdit = (category: Cat) => {
    setEditing(category);
    setName(category.name);
    setDesc(category.description ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Nama wajib diisi");

    const payload = { name: name.trim(), description: desc.trim() || null };

    if (editing) {
      const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("categories").insert(payload);
      if (error) return toast.error(error.message);
    }

    toast.success("Kategori disimpan");
    qc.invalidateQueries();
    setOpen(false);
  };

  const toggle = async (category: Cat) => {
    const { error } = await supabase
      .from("categories")
      .update({ is_active: !category.is_active })
      .eq("id", category.id);

    if (error) return toast.error(error.message);

    qc.invalidateQueries();
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-5 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            Kategori
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Kelola kategori produk.
          </p>
        </div>

        <Button onClick={openNew} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Tambah Kategori
        </Button>
      </div>

      <div className="space-y-3 sm:hidden">
        {data?.map((category) => (
          <Card key={category.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words font-semibold">{category.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {category.description || "-"}
                </div>
              </div>

              <Button size="icon" variant="ghost" onClick={() => openEdit(category)}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Status aktif</span>
              <Switch checked={category.is_active} onCheckedChange={() => toggle(category)} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-3">Nama</th>
                <th className="p-3">Deskripsi</th>
                <th className="p-3">Aktif</th>
                <th className="p-3" />
              </tr>
            </thead>

            <tbody>
              {data?.map((category) => (
                <tr key={category.id} className="border-t">
                  <td className="p-3 font-medium">{category.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {category.description || "-"}
                  </td>
                  <td className="p-3">
                    <Switch checked={category.is_active} onCheckedChange={() => toggle(category)} />
                  </td>
                  <td className="p-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(category)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>

            <Button onClick={save} className="w-full">
              Simpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}