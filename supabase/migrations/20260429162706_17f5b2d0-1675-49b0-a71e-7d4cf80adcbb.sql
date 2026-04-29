-- 1. Toggle do módulo contador no restaurante
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS accounting_reports_enabled boolean NOT NULL DEFAULT false;

-- 2. Campos fiscais opcionais e informativos em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS cst text,
  ADD COLUMN IF NOT EXISTS csosn text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS fiscal_unit text,
  ADD COLUMN IF NOT EXISTS fiscal_notes text;

-- Audit log da ativação/desativação do módulo
CREATE OR REPLACE FUNCTION public.log_accounting_toggle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accounting_reports_enabled IS DISTINCT FROM OLD.accounting_reports_enabled THEN
    INSERT INTO public.audit_log (action, entity, entity_id, restaurant_id, tenant_id, user_id, payload)
    VALUES (
      'accounting_module_toggled',
      'restaurant',
      NEW.id,
      NEW.id,
      NEW.tenant_id,
      auth.uid(),
      jsonb_build_object('enabled', NEW.accounting_reports_enabled)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_accounting_toggle ON public.restaurants;
CREATE TRIGGER trg_log_accounting_toggle
AFTER UPDATE OF accounting_reports_enabled ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.log_accounting_toggle();