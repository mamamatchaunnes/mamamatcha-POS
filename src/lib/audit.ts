import { supabase } from "@/integrations/supabase/client";

export async function logAudit(params: {
  action: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    action: params.action,
    entity_type: params.entity_type ?? null,
    entity_id: params.entity_id ?? null,
    description: params.description ?? null,
  });
}
