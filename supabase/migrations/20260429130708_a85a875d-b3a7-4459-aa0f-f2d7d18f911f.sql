-- products: code único por restaurante
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS products_restaurant_code_uidx
  ON public.products(restaurant_id, lower(code))
  WHERE code IS NOT NULL;

-- product_categories: code único por restaurante
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_restaurant_code_uidx
  ON public.product_categories(restaurant_id, lower(code))
  WHERE code IS NOT NULL;

-- product_variants: code único por produto
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_code_uidx
  ON public.product_variants(product_id, lower(code))
  WHERE code IS NOT NULL;

-- option_groups: code único por restaurante
ALTER TABLE public.option_groups ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS option_groups_restaurant_code_uidx
  ON public.option_groups(restaurant_id, lower(code))
  WHERE code IS NOT NULL;

-- option_items: code único por grupo
ALTER TABLE public.option_items ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS option_items_group_code_uidx
  ON public.option_items(group_id, lower(code))
  WHERE code IS NOT NULL;