import { CATEGORIES } from "./product-categories";

const PRODUCT_TEMPLATES: Record<
  string,
  { base: string[]; unitPriceRangeCents: [number, number]; vat: number }
> = {
  "Cleaning supplies": {
    base: [
      "All-purpose cleaner",
      "Degreaser",
      "Disinfectant",
      "Floor cleaner",
      "Glass cleaner",
    ],
    unitPriceRangeCents: [250, 2500],
    vat: 21,
  },
  "POS / Kassa materials": {
    base: [
      "Receipt paper",
      "Cash register ribbon",
      "Barcode labels",
      "Price gun labels",
    ],
    unitPriceRangeCents: [300, 1800],
    vat: 21,
  },
  "Displays & signage": {
    base: ["Acrylic holder", "Shelf talker", "Floor sticker", "Poster frame"],
    unitPriceRangeCents: [500, 9500],
    vat: 21,
  },
  Refrigeration: {
    base: ["Chiller shelf", "Gasket seal", "Thermometer", "Door hinge"],
    unitPriceRangeCents: [1500, 45000],
    vat: 21,
  },
  "Consumables — paper": {
    base: [
      "Hand towels",
      "Toilet paper",
      "Industrial wipe",
      "Greaseproof paper",
    ],
    unitPriceRangeCents: [200, 4500],
    vat: 21,
  },
  "Consumables — bags": {
    base: ["Plastic bag", "Paper bag", "Produce bag", "Cold transport bag"],
    unitPriceRangeCents: [50, 1200],
    vat: 21,
  },
  "Consumables — packaging": {
    base: ["Corrugated box", "Pallet wrap", "Packing tape", "Stretch film"],
    unitPriceRangeCents: [100, 3800],
    vat: 21,
  },
  "Safety & PPE": {
    base: ["Nitrile glove", "Safety goggles", "Hairnet", "Cut-resistant glove"],
    unitPriceRangeCents: [300, 2800],
    vat: 21,
  },
  "Small equipment": {
    base: ["Dust pan", "Squeegee", "Broom", "Mop head", "Bucket"],
    unitPriceRangeCents: [600, 4200],
    vat: 21,
  },
  "Spare parts": {
    base: ["Filter", "Belt", "Bolt set", "Plug fuse"],
    unitPriceRangeCents: [100, 8500],
    vat: 21,
  },
};

const UNITS = ["piece", "box", "liter", "pack", "carton"];
const SIZE_HINTS = [
  "small",
  "medium",
  "large",
  "XL",
  "bulk",
  "5L",
  "1L",
  "200ct",
  "100ct",
];

// Deterministic LCG — same seed always produces the same catalog.
function seedRand(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export type SeedProduct = {
  sku: string;
  name: string;
  description: string;
  category_name: string;
  unit: string;
  unit_price_cents: number;
  vat_rate: number;
  min_order_qty: number;
  max_order_qty: number | null;
};

export function generateProducts(total = 500): SeedProduct[] {
  const rand = seedRand(42);
  const products: SeedProduct[] = [];

  let counter = 0;
  while (products.length < total) {
    const cat = CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!;
    const tpl = PRODUCT_TEMPLATES[cat.name]!;
    const base = tpl.base[Math.floor(rand() * tpl.base.length)]!;
    const unit = UNITS[Math.floor(rand() * UNITS.length)]!;
    const sizeHint = SIZE_HINTS[Math.floor(rand() * SIZE_HINTS.length)]!;
    const sku = `SKU-${String(1000 + counter).padStart(4, "0")}-${sizeHint
      .toUpperCase()
      .slice(0, 3)}`;
    const price =
      Math.floor(
        rand() * (tpl.unitPriceRangeCents[1] - tpl.unitPriceRangeCents[0]),
      ) + tpl.unitPriceRangeCents[0];
    products.push({
      sku,
      name: `${base} — ${sizeHint}`,
      description: `${base} (${sizeHint}) for ${cat.name.toLowerCase()}.`,
      category_name: cat.name,
      unit,
      unit_price_cents: price,
      vat_rate: tpl.vat,
      min_order_qty: 1,
      max_order_qty: [null, 10, 25, 50][Math.floor(rand() * 4)] ?? null,
    });
    counter += 1;
  }
  return products;
}
