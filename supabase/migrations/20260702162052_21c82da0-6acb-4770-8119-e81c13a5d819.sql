
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','cashier');
CREATE TYPE public.order_status AS ENUM ('new','completed','cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid','paid','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','qris');
CREATE TYPE public.session_status AS ENUM ('open','closed');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Auto-create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  status public.order_status NOT NULL DEFAULT 'new',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  total_amount INTEGER NOT NULL DEFAULT 0,
  general_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  subtotal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);

-- PAYMENTS
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount INTEGER NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'paid',
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- CASHIER SESSIONS
CREATE TABLE public.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  cash_system_total INTEGER NOT NULL DEFAULT 0,
  qris_system_total INTEGER NOT NULL DEFAULT 0,
  cash_physical_total INTEGER NOT NULL DEFAULT 0,
  cash_difference INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  status public.session_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cashier_sessions TO authenticated;
GRANT ALL ON public.cashier_sessions TO service_role;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);

-- ============ POLICIES ============
-- profiles: user reads own; admin reads all
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles: authenticated can read (needed for role checks in UI); only admin writes
CREATE POLICY "roles_select_all_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- categories: all authenticated read; admin write
CREATE POLICY "cat_select" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_admin_write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- products: all authenticated read; admin write
CREATE POLICY "prod_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "prod_admin_write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- orders: staff (admin or cashier) can read/insert/update
CREATE POLICY "orders_staff_select" ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "orders_staff_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) AND created_by = auth.uid());
CREATE POLICY "orders_staff_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));

-- order_items: same as orders
CREATE POLICY "oi_staff_select" ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "oi_staff_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "oi_staff_update" ON public.order_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "oi_admin_delete" ON public.order_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- payments: staff read/insert/update
CREATE POLICY "pay_staff_select" ON public.payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "pay_staff_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) AND created_by = auth.uid());
CREATE POLICY "pay_staff_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));

-- cashier_sessions
CREATE POLICY "cs_select" ON public.cashier_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR cashier_id = auth.uid());
CREATE POLICY "cs_insert" ON public.cashier_sessions FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) AND cashier_id = auth.uid());
CREATE POLICY "cs_update" ON public.cashier_sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR cashier_id = auth.uid());

-- audit logs: admin read all; user reads own; staff insert
CREATE POLICY "al_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR user_id = auth.uid());
CREATE POLICY "al_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SEED CATEGORIES + PRODUCTS
INSERT INTO public.categories (name, description) VALUES
  ('Matcha Series','Minuman matcha signature'),
  ('Latte Series','Latte non-matcha'),
  ('Non Coffee','Minuman non kopi'),
  ('Snack','Cemilan pendamping'),
  ('Add On','Tambahan pesanan');

WITH c AS (SELECT id, name FROM public.categories)
INSERT INTO public.products (category_id, name, price, description) VALUES
  ((SELECT id FROM c WHERE name='Matcha Series'), 'Matcha Latte', 18000, 'Matcha latte hangat'),
  ((SELECT id FROM c WHERE name='Matcha Series'), 'Iced Matcha Latte', 20000, 'Matcha latte dingin'),
  ((SELECT id FROM c WHERE name='Matcha Series'), 'Matcha Strawberry', 22000, 'Perpaduan matcha dan strawberry'),
  ((SELECT id FROM c WHERE name='Matcha Series'), 'Matcha Chocolate', 22000, 'Matcha coklat lembut'),
  ((SELECT id FROM c WHERE name='Matcha Series'), 'Matcha Cheese Cream', 25000, 'Matcha dengan cheese cream'),
  ((SELECT id FROM c WHERE name='Latte Series'), 'Hojicha Latte', 20000, 'Hojicha panggang'),
  ((SELECT id FROM c WHERE name='Non Coffee'), 'Thai Tea', 15000, 'Thai tea creamy'),
  ((SELECT id FROM c WHERE name='Non Coffee'), 'Lemon Tea', 12000, 'Lemon tea segar'),
  ((SELECT id FROM c WHERE name='Snack'), 'Brownies Matcha', 15000, 'Brownies dengan matcha'),
  ((SELECT id FROM c WHERE name='Snack'), 'Cookies Matcha', 10000, 'Cookies matcha renyah');

-- ORDER CODE GENERATOR
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  suffix TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..5 LOOP
    suffix := suffix || substr(chars, floor(random()*length(chars))::int + 1, 1);
  END LOOP;
  RETURN 'MCH-' || to_char(now(),'YYYYMMDD') || '-' || suffix;
END; $$;
