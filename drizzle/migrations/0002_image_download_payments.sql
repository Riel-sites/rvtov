ALTER TABLE public.payment_requests ADD COLUMN kind text NOT NULL DEFAULT 'pack' CHECK (kind IN ('pack','download'));
ALTER TABLE public.payment_requests ADD COLUMN session_id uuid;
ALTER TABLE public.payment_requests ADD COLUMN local_amount text;
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_tokens_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_tokens_range CHECK (tokens >= 0 AND tokens <= 10000);