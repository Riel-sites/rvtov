CREATE TABLE public.style_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.try_on_sessions(id) ON DELETE CASCADE,
  style text NOT NULL,
  token_cost integer NOT NULL DEFAULT 1,
  image_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.style_variants TO authenticated;
GRANT ALL ON public.style_variants TO service_role;
ALTER TABLE public.style_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read styles" ON public.style_variants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX style_variants_user_idx ON public.style_variants(user_id, created_at DESC);