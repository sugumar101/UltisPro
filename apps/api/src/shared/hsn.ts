/**
 * HSN (Harmonised System of Nomenclature) code suggestion.
 *
 * **Important:** unlike SKUs, barcodes or product codes, an HSN code cannot
 * be *generated* — it is a government-defined classification, it determines
 * the GST rate applied, and printing a wrong one on a tax invoice is a
 * compliance problem, not a cosmetic one. So this module never invents a
 * code. It maps product wording onto the standard apparel/retail codes that
 * already exist, and returns null when nothing matches confidently rather
 * than guessing.
 *
 * Chapter 61 covers knitted/crocheted garments, chapter 62 covers woven
 * ones. Where a garment could plausibly be either (a shirt may be knit or
 * woven), the more common retail classification is used. These are
 * defaults to save typing — every one of them remains editable on the
 * product and on the product type, and a retailer should confirm them with
 * their accountant.
 */

interface HsnRule {
  /** Matched against lowercased text; ordered, first match wins. */
  keywords: string[];
  code: string;
  description: string;
}

/**
 * Order matters: more specific terms must precede the general ones they
 * contain. "t-shirt" is checked before "shirt", "track pant" before "pant",
 * otherwise the broader rule would swallow the narrower one.
 */
const HSN_RULES: HsnRule[] = [
  // --- Knitted garments (Chapter 61) ---
  { keywords: ['t-shirt', 'tshirt', 't shirt', 'tee', 'polo', 'singlet', 'vest'], code: '6109', description: 'T-shirts, singlets and other vests, knitted' },
  { keywords: ['sweatshirt', 'hoodie', 'pullover', 'jersey', 'cardigan', 'sweater'], code: '6110', description: 'Jerseys, pullovers, sweatshirts and cardigans, knitted' },
  { keywords: ['baby', 'babies', 'infant', 'newborn'], code: '6111', description: "Babies' garments and clothing accessories, knitted" },
  { keywords: ['track suit', 'tracksuit', 'sportswear', 'swimwear', 'swimsuit'], code: '6112', description: 'Track suits, ski suits and swimwear, knitted' },
  { keywords: ['sock', 'stocking', 'hosiery', 'tights'], code: '6115', description: 'Panty hose, tights, stockings and socks, knitted' },
  { keywords: ['glove', 'mitten'], code: '6116', description: 'Gloves, mittens and mitts, knitted' },

  // --- Woven garments (Chapter 62) ---
  { keywords: ['overcoat', 'raincoat', 'windcheater', 'anorak'], code: '6201', description: "Men's overcoats, raincoats and anoraks, woven" },
  { keywords: ['track pant', 'trouser', 'pant', 'jean', 'denim', 'short', 'bermuda', 'chino'], code: '6203', description: "Men's trousers, shorts, suits and jackets, woven" },
  { keywords: ['skirt', 'dress', 'gown', 'kurti', 'saree', 'sari', 'lehenga', 'salwar', 'kurta set'], code: '6204', description: "Women's dresses, skirts, suits and trousers, woven" },
  { keywords: ['shirt', 'kurta'], code: '6205', description: "Men's shirts, woven" },
  { keywords: ['blouse'], code: '6206', description: "Women's blouses and shirts, woven" },
  { keywords: ['nightwear', 'pyjama', 'pajama', 'nightdress', 'robe'], code: '6207', description: 'Singlets, nightshirts, pyjamas and bathrobes' },
  { keywords: ['brief', 'boxer', 'underwear', 'innerwear', 'panty'], code: '6207', description: 'Underwear and briefs' },
  { keywords: ['bra', 'lingerie', 'corset'], code: '6212', description: 'Brassieres, girdles, corsets and similar articles' },
  { keywords: ['handkerchief'], code: '6213', description: 'Handkerchiefs' },
  { keywords: ['scarf', 'shawl', 'stole', 'dupatta', 'muffler'], code: '6214', description: 'Shawls, scarves, mufflers and veils' },
  { keywords: ['tie', 'bow tie', 'cravat'], code: '6215', description: 'Ties, bow ties and cravats' },

  // --- Accessories and footwear ---
  { keywords: ['cap', 'hat', 'beanie'], code: '6505', description: 'Hats and other headgear, knitted or made up' },
  { keywords: ['shoe', 'sneaker', 'sandal', 'slipper', 'footwear', 'boot'], code: '6403', description: 'Footwear with uppers of leather' },
  { keywords: ['bag', 'handbag', 'backpack', 'wallet', 'purse'], code: '4202', description: 'Trunks, suitcases, handbags and wallets' },
  { keywords: ['belt'], code: '4203', description: 'Articles of apparel and accessories of leather' },
  { keywords: ['towel'], code: '6302', description: 'Bed linen, table linen, toilet and kitchen linen' },
];

/**
 * Returns the best-matching HSN code for a free-text description (product
 * name, product type name, category, or any combination), or null if nothing
 * matches. Null is a deliberate outcome — leaving HSN blank is far better
 * than stamping an invoice with a wrong classification.
 */
export function suggestHsnCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();

  for (const rule of HSN_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.code;
    }
  }

  return null;
}

/** The matched rule including its description — used to explain a suggestion in the UI. */
export function suggestHsn(text: string | null | undefined): HsnRule | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  return HSN_RULES.find((rule) => rule.keywords.some((keyword) => haystack.includes(keyword))) ?? null;
}
