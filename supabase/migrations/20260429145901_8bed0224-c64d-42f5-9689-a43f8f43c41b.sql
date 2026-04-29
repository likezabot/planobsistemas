
-- Remove versão antiga (parâmetros TEXT) que conflita com a nova (enums tipados).
DROP FUNCTION IF EXISTS public.create_public_order(
  text, text, text, text, text, text, jsonb, text, text
);
