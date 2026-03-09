

## Arabic Translation Layer with RTL Support

### Architecture

1. **`src/lib/translations.ts`** — Single, well-organized translations file with English and Arabic mappings, grouped by section (nav, common, dashboard, orders, manufacturing, etc.). Easy to edit.

2. **`src/contexts/LanguageContext.tsx`** — Context provider storing current language (`en`/`ar`) in `localStorage`. Provides `language`, `setLanguage`, `t(key)` function, and `dir` (`ltr`/`rtl`).

3. **`src/main.tsx`** — Wrap `<App>` with `<LanguageProvider>`.

4. **`src/components/AppLayout.tsx`** — 
   - Add language toggle button (🌐 EN/AR) in the top header next to the logout button.
   - Apply `dir={dir}` to root div.
   - When RTL: flip sidebar from left to right, adjust chevrons, fix `translate-x` directions.
   - Translate nav item titles using `t()`.

5. **`src/index.css`** — Add RTL-aware utility overrides (e.g., sidebar positioning with `[dir="rtl"]` selectors).

6. **Page files** — Progressively replace hardcoded strings with `t('key')` calls in major pages (Dashboard, Orders, etc.). This is a large app, so the initial pass covers navigation, common labels, and key page headers. More translations can be added incrementally to the file.

### Translation File Structure
```ts
// src/lib/translations.ts
export const translations = {
  // ── Navigation ──
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.orders": { en: "Orders", ar: "الطلبات" },
  ...
  
  // ── Common ──
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  ...
  
  // ── Dashboard ──
  "dashboard.greeting": { en: "Good morning", ar: "صباح الخير" },
  ...
  
  // ── Orders ──
  // ── Manufacturing ──
  // ── Finishing ──
  // ── Packaging ──
  // ── Boxing ──
  // ── Warehouse ──
  // ── Reports ──
  // ── Admin ──
}
```

### RTL Handling
- `document.documentElement.dir` set to `rtl`/`ltr` on language change
- Sidebar flips to right side via `[dir="rtl"]` CSS
- Tailwind `space-x`, `gap`, `text-right/left` work naturally with logical properties
- Chevron icons swap direction in RTL mode

### Scope
Initial pass translates: sidebar nav, header elements, role names, common buttons/labels, and all major page titles. The file includes placeholder keys for deeper content so you can fill in Arabic translations incrementally.

