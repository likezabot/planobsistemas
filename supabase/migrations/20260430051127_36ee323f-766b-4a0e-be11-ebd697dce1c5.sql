ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS cash_session_required boolean NOT NULL DEFAULT true;