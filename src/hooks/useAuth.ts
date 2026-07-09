import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "cashier" | null;

let cachedSession: Session | null | undefined = undefined;
const cachedRoles = new Map<string, Role>();
const roleRequests = new Map<string, Promise<Role>>();

async function resolveRole(userId: string): Promise<Role> {
  if (cachedRoles.has(userId)) {
    return cachedRoles.get(userId) ?? null;
  }

  const existingRequest = roleRequests.get(userId);

  if (existingRequest) {
    return existingRequest;
  }

  const request = supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .then(({ data, error }) => {
      if (error) throw error;

      const roles = (data ?? []).map((row: { role: string }) => row.role);

      let resolvedRole: Role = null;

      if (roles.includes("admin")) {
        resolvedRole = "admin";
      } else if (roles.includes("cashier")) {
        resolvedRole = "cashier";
      }

      cachedRoles.set(userId, resolvedRole);

      return resolvedRole;
    })
    .finally(() => {
      roleRequests.delete(userId);
    });

  roleRequests.set(userId, request);

  return request;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(cachedSession ?? null);
  const [user, setUser] = useState<User | null>(cachedSession?.user ?? null);
  const [role, setRole] = useState<Role>(() => {
    const userId = cachedSession?.user?.id;

    if (!userId) return null;

    return cachedRoles.get(userId) ?? null;
  });
  const [loading, setLoading] = useState(cachedSession === undefined);
  const [roleLoaded, setRoleLoaded] = useState(() => {
    const userId = cachedSession?.user?.id;

    if (!userId) return false;

    return cachedRoles.has(userId);
  });

  useEffect(() => {
    let alive = true;

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        cachedSession = nextSession;

        if (event === "SIGNED_OUT") {
          cachedSession = null;
          cachedRoles.clear();
          roleRequests.clear();
        }

        if (!alive) return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
      },
    );

    if (cachedSession === undefined) {
      supabase.auth.getSession().then(({ data }) => {
        cachedSession = data.session;

        if (!alive) return;

        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoaded(false);
      return;
    }

    if (cachedRoles.has(user.id)) {
      setRole(cachedRoles.get(user.id) ?? null);
      setRoleLoaded(true);
      return;
    }

    let alive = true;

    setRoleLoaded(false);

    resolveRole(user.id)
      .then((resolvedRole) => {
        if (!alive) return;

        setRole(resolvedRole);
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!alive) return;

        setRole(null);
        setRoleLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  return { session, user, role, loading, roleLoaded };
}