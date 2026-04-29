import type { CatalogPayload } from "./importSchema";

/**
 * Modelo JSON de catálogo. Cobre todos os tipos de produto:
 * simples, variável (tamanhos), com adicionais, e pizza com sabores reais.
 *
 * IMPORTANTE: sabores agora vivem em `pizza_flavors` (tabela própria).
 * A pizza-pai vincula sabores via `pizza_flavor_codes` e define preço
 * por tamanho via `pizza_flavor_prices`.
 * Bordas usam `option_groups` com `price_overrides` por variant.
 */
export const sampleCatalog: CatalogPayload = {
  version: "2",
  categories: [
    { code: "BEBIDAS", name: "Bebidas", sort_order: 1, active: true },
    { code: "LANCHES", name: "Lanches", sort_order: 2, active: true },
    { code: "PIZZAS", name: "Pizzas", sort_order: 3, active: true },
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
        {
          code: "BORDA_CATUPIRY",
          name: "Catupiry",
          price_cents: 800, // preço default
          // borda muda de preço por tamanho:
          price_overrides: [
            { variant_code: "PIZZA_BROTO", price_cents: 400 },
            { variant_code: "PIZZA_M", price_cents: 700 },
            { variant_code: "PIZZA_G", price_cents: 900 },
            { variant_code: "PIZZA_GG", price_cents: 1200 },
          ],
        },
        {
          code: "BORDA_CHEDDAR",
          name: "Cheddar",
          price_cents: 800,
          price_overrides: [
            { variant_code: "PIZZA_BROTO", price_cents: 400 },
            { variant_code: "PIZZA_M", price_cents: 700 },
            { variant_code: "PIZZA_G", price_cents: 900 },
            { variant_code: "PIZZA_GG", price_cents: 1200 },
          ],
        },
        { code: "BORDA_NORMAL", name: "Sem borda recheada", price_cents: 0 },
      ],
    },
  ],
  pizza_flavors: [
    {
      code: "MARGHERITA",
      name: "Margherita",
      description: "Molho, mussarela, manjericão fresco e azeite.",
      category: "Tradicional",
      sort_order: 1,
      active: true,
    },
    {
      code: "CALABRESA",
      name: "Calabresa",
      description: "Molho, mussarela, calabresa fatiada e cebola.",
      category: "Tradicional",
      sort_order: 2,
      active: true,
    },
    {
      code: "PORTUGUESA",
      name: "Portuguesa",
      description: "Molho, mussarela, presunto, ovo, ervilha, cebola, azeitona.",
      category: "Tradicional",
      sort_order: 3,
      active: true,
    },
    {
      code: "QUATRO_QUEIJOS",
      name: "Quatro Queijos",
      description: "Mussarela, parmesão, gorgonzola e provolone.",
      category: "Especial",
      sort_order: 4,
      active: true,
    },
    {
      code: "CHOCOLATE",
      name: "Chocolate ao Leite",
      description: "Chocolate ao leite com morango.",
      category: "Doce",
      sort_order: 10,
      active: true,
    },
  ],
  products: [
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
      ],
    },
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
    // PIZZA com 4 tamanhos + 2 sabores + bordas com preço por tamanho
    {
      code: "PIZZA",
      name: "Pizza",
      category_code: "PIZZAS",
      price_cents: 0, // preço base via tamanho
      type: "pizza",
      active: true,
      sort_order: 1,
      variants: [
        { code: "PIZZA_BROTO", name: "Broto (4 fatias)", price_cents: 2500, sort_order: 1 },
        { code: "PIZZA_M", name: "Média (6 fatias)", price_cents: 4000, sort_order: 2 },
        { code: "PIZZA_G", name: "Grande (8 fatias)", price_cents: 5500, sort_order: 3 },
        { code: "PIZZA_GG", name: "Família (12 fatias)", price_cents: 7500, sort_order: 4 },
      ],
      pizza_config: {
        max_flavors: 2,
        price_rule: "max",
        allow_edge_customization: true,
      },
      pizza_flavor_codes: ["MARGHERITA", "CALABRESA", "PORTUGUESA", "QUATRO_QUEIJOS", "CHOCOLATE"],
      // Adicional do sabor por tamanho (regra max/avg/sum aplicada sobre estes valores).
      // Sabor "default" custa 0; especiais cobram a mais conforme o tamanho.
      pizza_flavor_prices: [
        { flavor_code: "QUATRO_QUEIJOS", variant_code: "PIZZA_BROTO", price_cents: 200 },
        { flavor_code: "QUATRO_QUEIJOS", variant_code: "PIZZA_M", price_cents: 400 },
        { flavor_code: "QUATRO_QUEIJOS", variant_code: "PIZZA_G", price_cents: 600 },
        { flavor_code: "QUATRO_QUEIJOS", variant_code: "PIZZA_GG", price_cents: 800 },
        { flavor_code: "CHOCOLATE", variant_code: "PIZZA_BROTO", price_cents: 300 },
        { flavor_code: "CHOCOLATE", variant_code: "PIZZA_M", price_cents: 500 },
        { flavor_code: "CHOCOLATE", variant_code: "PIZZA_G", price_cents: 700 },
        { flavor_code: "CHOCOLATE", variant_code: "PIZZA_GG", price_cents: 900 },
      ],
      option_group_codes: ["BORDAS_PIZZA"],
    },
  ],
};
