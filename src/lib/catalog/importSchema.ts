import { z } from "zod";

/**
 * Schema do JSON de importação/exportação do catálogo.
 *
 * Regras críticas (também validadas no servidor pela RPC import_catalog):
 *  - preço/custo não negativos
 *  - pizza: max_flavors entre 1 e 4
 *  - grupo obrigatório precisa min_options >= 1
 *  - codes únicos dentro do mesmo escopo
 *  - sem categoria/grupo/sabor referenciado inexistente
 */

export const variantSchema = z.object({
  code: z.string().trim().min(1, "code obrigatório").max(64),
  name: z.string().trim().min(1).max(120),
  price_cents: z.number().int().min(0, "price_cents não pode ser negativo"),
  cost_cents: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const priceOverrideSchema = z.object({
  variant_code: z.string().trim().min(1).max(64),
  price_cents: z.number().int().min(0),
});

export const optionItemSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  price_cents: z.number().int().min(0, "price_cents não pode ser negativo"),
  cost_cents: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
  // Override de preço por tamanho (ex: borda muda de preço por variant)
  price_overrides: z.array(priceOverrideSchema).optional().default([]),
});

export const optionGroupSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    min_options: z.number().int().min(0).default(0),
    max_options: z.number().int().min(1).default(1),
    is_required: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
    sort_order: z.number().int().optional().default(0),
    items: z.array(optionItemSchema).default([]),
  })
  .superRefine((g, ctx) => {
    if (g.is_required && g.min_options < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grupo "${g.name}" é obrigatório mas min_options < 1.`,
      });
    }
    if (g.max_options < g.min_options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grupo "${g.name}": max_options < min_options.`,
      });
    }
    const seen = new Set<string>();
    for (const it of g.items) {
      const k = it.code.toLowerCase();
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Grupo "${g.name}": item duplicado "${it.code}".`,
        });
      }
      seen.add(k);
    }
  });

export const categorySchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  sort_order: z.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

export const pizzaConfigSchema = z.object({
  max_flavors: z
    .number()
    .int()
    .min(1, "max_flavors mínimo é 1")
    .max(4, "max_flavors máximo é 4"),
  price_rule: z.enum(["max", "average", "sum"]).default("max"),
  allow_edge_customization: z.boolean().optional().default(true),
});

export const pizzaFlavorSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(60).optional().nullable(), // ex: "Tradicional", "Especial"
  image_url: z.string().url().max(500).optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const pizzaFlavorPriceSchema = z.object({
  flavor_code: z.string().trim().min(1).max(64),
  variant_code: z.string().trim().min(1).max(64),
  price_cents: z.number().int().min(0),
});

export const productTypeSchema = z.enum([
  "simple",
  "variable",
  "pizza",
  "combo",
]);

export const productSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).optional().nullable(),
    category_code: z.string().trim().min(1).max(64).optional().nullable(),
    price_cents: z.number().int().min(0, "price_cents não pode ser negativo"),
    cost_cents: z.number().int().min(0).optional().default(0),
    active: z.boolean().optional().default(true),
    sort_order: z.number().int().optional().default(0),
    image_url: z.string().url().max(500).optional().nullable(),
    type: productTypeSchema.optional().default("simple"),
    variants: z.array(variantSchema).optional().default([]),
    option_group_codes: z.array(z.string().min(1)).optional().default([]),
    pizza_config: pizzaConfigSchema.optional().nullable(),
    // PIZZA: códigos dos sabores disponíveis
    pizza_flavor_codes: z.array(z.string().min(1)).optional().default([]),
    // PIZZA: preço de cada sabor por tamanho desta pizza
    pizza_flavor_prices: z.array(pizzaFlavorPriceSchema).optional().default([]),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    for (const v of p.variants ?? []) {
      const k = v.code.toLowerCase();
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Produto "${p.name}": variação duplicada "${v.code}".`,
        });
      }
      seen.add(k);
    }
    if (p.type === "pizza" && !p.pizza_config) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Produto pizza "${p.name}" precisa de pizza_config.`,
      });
    }
    if (p.type === "variable" && (p.variants?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Produto variável "${p.name}" precisa ter ao menos uma variação.`,
      });
    }
    // pizza_flavor_prices só faz sentido se variants existem
    if ((p.pizza_flavor_prices?.length ?? 0) > 0) {
      const variantCodes = new Set((p.variants ?? []).map((v) => v.code.toLowerCase()));
      for (const pfp of p.pizza_flavor_prices ?? []) {
        if (!variantCodes.has(pfp.variant_code.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Produto "${p.name}": pizza_flavor_prices referencia variant "${pfp.variant_code}" inexistente.`,
          });
        }
      }
    }
  });

export const catalogPayloadSchema = z
  .object({
    version: z.string().default("1"),
    categories: z.array(categorySchema).default([]),
    option_groups: z.array(optionGroupSchema).default([]),
    pizza_flavors: z.array(pizzaFlavorSchema).default([]),
    products: z.array(productSchema).default([]),
  })
  .superRefine((payload, ctx) => {
    const catCodes = new Set<string>();
    for (const c of payload.categories) {
      const k = c.code.toLowerCase();
      if (catCodes.has(k))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Categoria duplicada "${c.code}".`,
        });
      catCodes.add(k);
    }
    const ogCodes = new Set<string>();
    for (const g of payload.option_groups) {
      const k = g.code.toLowerCase();
      if (ogCodes.has(k))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Grupo de adicional duplicado "${g.code}".`,
        });
      ogCodes.add(k);
    }
    const pfCodes = new Set<string>();
    for (const f of payload.pizza_flavors) {
      const k = f.code.toLowerCase();
      if (pfCodes.has(k))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sabor de pizza duplicado "${f.code}".`,
        });
      pfCodes.add(k);
    }
    const prodCodes = new Set<string>();
    for (const p of payload.products) {
      const k = p.code.toLowerCase();
      if (prodCodes.has(k))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Produto duplicado "${p.code}".`,
        });
      prodCodes.add(k);

      if (p.category_code && !catCodes.has(p.category_code.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Produto "${p.name}": categoria "${p.category_code}" não existe no JSON.`,
        });
      }
      for (const ogc of p.option_group_codes ?? []) {
        if (!ogCodes.has(ogc.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Produto "${p.name}": grupo "${ogc}" não existe no JSON.`,
          });
        }
      }
      for (const fc of p.pizza_flavor_codes ?? []) {
        if (!pfCodes.has(fc.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Pizza "${p.name}": sabor "${fc}" não existe no JSON.`,
          });
        }
      }
      for (const pfp of p.pizza_flavor_prices ?? []) {
        if (!pfCodes.has(pfp.flavor_code.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Pizza "${p.name}": pricing referencia sabor "${pfp.flavor_code}" inexistente.`,
          });
        }
      }
    }
  });

export type CatalogPayload = z.infer<typeof catalogPayloadSchema>;

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((iss) => {
    const path = iss.path.length ? iss.path.join(".") + ": " : "";
    return path + iss.message;
  });
}
