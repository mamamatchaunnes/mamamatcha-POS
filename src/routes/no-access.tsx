import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/no-access")({
  ssr: false,
  component: NoAccess,
});

function NoAccess() {
  const navigate = useNavigate();
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-cream to-background">
      <Card className="max-w-md p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Akun belum memiliki akses</h1>
        <p className="text-sm text-muted-foreground">
          Akun kamu berhasil dibuat tapi belum memiliki role. Silakan hubungi admin
          mamamatcha.unnes untuk mendapatkan akses sebagai admin atau kasir.
        </p>
        <Button variant="outline" onClick={logout} className="w-full">
          Keluar
        </Button>
      </Card>
    </div>
  );
}
