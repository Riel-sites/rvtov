CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  pack_name text NOT NULL,
  tokens integer NOT NULL CHECK (tokens > 0 AND tokens <= 10000),
  price_usd numeric NOT NULL,
  sender_phone text NOT NULL CHECK (char_length(sender_phone) BETWEEN 6 AND 20),
  transaction_ref text NOT NULL CHECK (char_length(transaction_ref) BETWEEN 3 AND 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users create own pending requests" ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND reviewed_by IS NULL);
CREATE POLICY "Users read own requests" ON public.payment_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update requests" ON public.payment_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));