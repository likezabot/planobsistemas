import type { CatalogPayload } from "./importSchema";

/**
 * Modelo JSON de catálogo. Cobre todos os tipos de produto:
 * simples, variável (tamanhos), com adicionais, e pizza com sabores.
 */
export const sampleCatalog: CatalogPayload = {
  version: "1",
  categories: [
    { code: "BEBIDAS", name: "Bebidas", sort_order: 1, active: true },
    { code: "LANCHES", name: "Lanches", sort_order: 2, active: true },
    { code: "PIZZAS", name: "Pizzas", sort_order: 3, active: true },
    { code: "SABORES", name: "Sabores de Pizza", sort_order: 99, active: true },
  ],
  option_groups: [
    {
      code: "ADICIONAIS_BURGER",
      name: "Adicionais do Lanche",
      min_options: 0,
      max_options: 5,
      is_required: false,
      active: true,
      sort_order: 1,
      items: [
        { code: "BACON", name: "Bacon", price_cents: 400, active: true },
        { code: "QUEIJO_EXTRA", name: "Queijo extra", price_cents: 300, active: true },
        { code: "OVO", name: "Ovo", price_cents: 200, active: true },
      ],
    },
    {
      code: "PONTO_CARNE",
      name: "Ponto da Carne",
      min_options: 1,
      max_options: 1,
      is_required: true,
      active: true,
      sort_order: 2,
      items: [
        { code: "MAL_PASSADA", name: "Mal passada", price_cents: 0 },
        { code: "AO_PONTO", name: "Ao ponto", price_cents: 0 },
        { code: "BEM_PASSADA", name: "Bem passada", price_cents: 0 },
      ],
    },
    {
      code: "BORDAS_PIZZA",
      name: "Bordas",
      min_options: 0,
      max_options: 1,
      is_required: false,
      active: true,
      sort_order: 3,
      items: [
        { code: "BORDA_CATUPIRY", name: "Catupiry", price_cents: 800 },
        { code: "BORDA_CHEDDAR", name: "Cheddar", price_cents: 800 },
        { code: "BORDA_NORMAL", name: "Sem borda recheada", price_cents: 0 },
      ],
    },
  ],
  products: [
    // SIMPLES
    {
      code: "COCA_350",
      name: "Coca-Cola Lata 350ml",
      category_code: "BEBIDAS",
      price_cents: 700,
      cost_cents: 350,
      type: "simple",
      active: true,
      sort_order: 1,
    },
    // VARIÁVEL (tamanhos)
    {
      code: "SUCO_LARANJA",
      name: "Suco de Laranja Natural",
      category_code: "BEBIDAS",
      price_cents: 0,
      type: "variable",
      active: true,
      sort_order: 2,
      variants: [
        { code: "SUCO_300", name: "300ml", price_cents: 900, sort_order: 1 },
        { code: "SUCO_500", name: "500ml", price_cents: 1400, sort_order: 2 },
        { code: "SUCO_1L", name: "1L", price_cents: 2400, sort_order: 3 },
      ],
    },
    // SIMPLES + ADICIONAIS
    {
      code: "BURGER_CLASSIC",
      name: "X-Burger Clássico",
      description: "Pão, hambúrguer 150g, queijo, alface e tomate.",
      category_code: "LANCHES",
      price_cents: 2500,
      cost_cents: 900,
      type: "simple",
      active: true,
      sort_order: 1,
      option_group_codes: ["ADICIONAIS_BURGER", "PONTO_CARNE"],
    },
    // PIZZA com tamanhos + 2 sabores
    {
      code: "PIZZA_GRANDE",
      name: "Pizza Grande",
      category_code: "PIZZAS",
      price_cents: 0,
      type: "pizza",
      active: true,
      sort_order: 1,
      variants: [
        { code: "PIZZA_BROTO", name: "Broto", price_cents: 2500, sort_order: 1 },
        { code: "PIZZA_M", name: "Média", price_cents: 4500, sort_order: 2 },
        { code: "PIZZA_G", name: "Grande", price_cents: 5500, sort_order: 3 },
        { code: "PIZZA_GG", name: "Família", price_cents: 7000, sort_order: 4 },
      ],
      pizza_config: {
        max_flavors: 2,
        price_rule: "max",
        allow_edge_customization: true,
      },
      option_group_codes: ["BORDAS_PIZZA"],
    },
    // SABORES de pizza (são produtos simples na categoria SABORES)
    {
      code: "SABOR_MARGUERITA",
      name: "Margherita",
      category_code: "SABORES",
      price_cents: 4500,
      type: "simple",
      active: true,
    },
    {
      code: "SABOR_CALABRESA",
      name: "Calabresa",
      category_code: "SABORES",
      price_cents: 4500,
      type: "simple",
      active: true,
    },
    {
      code: "SABOR_PORTUGUESA",
      name: "Portuguesa",
      category_code: "SABORES",
      price_cents: 5000,
      type: "simple",
      active: true,
    },
  ],
};
