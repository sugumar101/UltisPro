# UltisPro — Design System

Source: 7 approved mockups + a design-token spec found in your reference folder (`ultisPro-design/stitch_retail_flow_saas_dashboard/`) — `point_of_sale_pos`, `product_management`, `product_management_clothing_retail`, `inventory_management`, `inventory_control_clothing_retail`, `analytics_dashboard`, `analytics_overview_clothing_retail`, plus a `core_ledger/DESIGN.md` token file. This document converts those into the Tailwind/shadcn theme the frontend module of every phase will be built against, so every screen is visually consistent from the first component onward.

## 1. Brand Direction
Minimalism + "Corporate Modernism" — enterprise inventory density paired with fintech-grade polish. Authoritative, precise, unobtrusive: the UI should never compete with the data (prices, stock counts, totals) it displays. This directly matches the brief's reference points (Stripe, Linear, Shopify, Square POS).

## 2. Color Tokens (Material Design 3-style palette, light mode primary)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#004bca` | Primary actions ("Complete Payment"), active nav state, links |
| `primary-container` | `#0061ff` | Hover/emphasis variants of primary |
| `on-primary` | `#ffffff` | Text/icons on primary surfaces |
| `secondary` | `#505f76` | Secondary buttons, muted emphasis |
| `secondary-container` | `#d0e1fb` | Loyalty/points badges, soft highlight blocks |
| `tertiary` | `#005c85` | Tertiary accents, info states |
| `error` | `#ba1a1a` | Destructive actions, error badges, negative deltas |
| `success` (semantic, not in raw token file) | Tailwind `green-500`/`green-600` | In-stock status, positive KPI deltas, sync indicator |
| `warning` (semantic) | Tailwind `amber-500` | Low-stock, near-expiry badges |
| `background` / `surface` | `#f7f9fb` | App background |
| `surface-container-lowest` | `#ffffff` | Cards, sidebar, modals |
| `surface-container-low` | `#f2f4f6` | Table header background, input fill (inactive) |
| `outline-variant` | `#c2c6d9` | Borders, dividers |
| `on-surface` | `#191c1e` | Primary text |
| `on-surface-variant` | `#424656` | Secondary/muted text |

Dark mode: Slate-950 background, Slate-900 elevated cards (per source DESIGN.md §Colors) — implemented as a parallel `dark:` token set in Tailwind config, not a separate theme file, so every component works in both modes for free.

## 3. Typography
**Inter** exclusively (400/500/600/700 weights), plus a monospace face for tabular/numeric data.

| Style | Size / Line-height | Weight | Usage |
|---|---|---|---|
| `display-total` | 48px / 56px, −0.02em | 700 | POS grand-total display only |
| `headline-lg` | 30px / 38px | 600 | Page titles |
| `headline-md` | 24px / 32px | 600 | Section headers, KPI values |
| `title-sm` | 18px / 28px | 600 | Card titles |
| `body-lg` | 16px / 24px | 400 | Primary body text |
| `body-md` | 14px / 20px | 400 | Default UI text |
| `label-sm` | 12px / 16px, +0.02em | 500 | Table headers (uppercase), badges |
| `mono-data` | 14px / 20px | 400 (monospace) | SKUs, invoice numbers, quantities — ensures column alignment in tables |

## 4. Layout System
Fixed three-section desktop layout:

1. **Left sidebar** — 260px, collapses to 64px on smaller viewports. Icons are Material Symbols Outlined, 20px/2px stroke. Active item: primary-blue fill, white text/icon. Hover: `surface-container-highest`.
2. **Top nav** — 64px height, global search ("Scan Barcode or Search (F1)"), notifications, store switcher, register/session indicator.
3. **Main content** — fluid, max-width 1600px, 12-column grid, 24px gutter, 32px container padding, 8px base spacing unit.

KPI cards span 3 of 12 columns (4 per row); data tables span all 12.

## 5. Elevation & Shape
- **Level 0** background: `surface` (`#f7f9fb`).
- **Level 1** (cards): white, 1px `outline-variant` border, 12px radius (`rounded-xl`).
- **Level 2** (modals/popovers): white, layered shadow `0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05)`.
- Standard controls (buttons/inputs): 8px radius. Containers: 12px. Badges/pills: fully rounded (999px).

## 6. Core Components (as observed in the approved mockups)

- **KPI card**: white/12px-radius container, `headline-md` value, percentage-delta label, bottom sparkline (2px stroke, no area fill, primary-blue or success-green).
- **Data table**: `surface-container-low` header background, uppercase `label-sm` header text, 56px row height, `mono-data` for SKU/invoice/quantity columns, subtle tint status badges (e.g., success-green at 10% opacity for "In Stock").
- **Product grid card (POS)**: image thumbnail, truncated title (`title-sm`), price in primary color, stock count, circular "add" affordance that inverts to primary on hover.
- **POS cart/invoice panel**: line items with quantity stepper, per-line tax breakdown, promo/discount row styled as a tinted callout, totals block, and a high-contrast `on-surface`-background "Total Payable" strip using `display-total` typography in white — the one place on the screen using the largest type scale, by design, so the amount due is unmistakable.
- **Payment method selector**: segmented "ghost" toggle buttons (Cash/Card/UPI/Split), selected state gets a 2px primary border and tinted fill.
- **Sidebar nav**: as described in §4.
- **Keyboard-shortcut bar**: fixed footer strip on the POS screen showing live key bindings (F1 search, F2 print, F4 hold, F8 add customer, Space to pay) — reinforces POS-02's all-keyboard operation requirement directly in the UI.
- **Search input**: 16px leading icon, `surface-container-low` fill when inactive, white fill + 2px primary ring when focused.
- **Filter chips**: horizontally scrollable pill buttons for category quick-filters.

## 7. Implementation Mapping

- Tailwind config: `theme.extend.colors` populated 1:1 from the token table in §2 (matches the `tailwind-config` block already present in the mockups almost verbatim — reusing it directly is intentional so the shipped UI matches the approved designs pixel-for-pixel, not just "inspired by").
- shadcn/ui components are generated against this same token set (`--primary`, `--secondary`, etc. CSS variables mapped from §2) so shadcn's Button/Dialog/Sheet/Table primitives inherit the brand automatically instead of needing per-component overrides.
- Icons: Material Symbols Outlined (loaded once, used everywhere) rather than mixing icon sets.
- The mockups are plain Tailwind CDN HTML (prototyping artifacts) — the production build ports these tokens and layouts into real Next.js/shadcn components module by module; the HTML files are a visual reference, not something imported as-is.

## 8. Screens Already Mocked (map to modules in 04-module-breakdown.md)

| Mockup | Maps to module |
|---|---|
| `point_of_sale_pos` | M8 — POS |
| `product_management`, `product_management_clothing_retail` | M4 — Product Catalog (generic + variant-heavy vertical) |
| `inventory_management`, `inventory_control_clothing_retail` | M5 — Inventory |
| `analytics_dashboard`, `analytics_overview_clothing_retail` | M12 — Dashboard |

No mockup yet exists for Suppliers/Purchasing (M6), Customers (M7), Sales/Invoices (M9), or Reports (M11) — these will be designed in the same token system when their phase starts, keeping visual consistency without needing every screen mocked upfront.
