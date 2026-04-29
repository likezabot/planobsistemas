-- Habilita módulo pizza apenas no restaurante de fixtures e2e-public-on
-- (necessário para os testes E2E de pizza que usam pizzas/sabores nesse slug).
-- NÃO mexe em nenhum restaurante real do cliente.
UPDATE public.restaurants
   SET pizza_module_enabled = true
 WHERE slug = 'e2e-public-on';