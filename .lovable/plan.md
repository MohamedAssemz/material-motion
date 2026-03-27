

# Fix: Missing Translation Keys for Catalog Fields

## Problem
Translation keys like `catalog.english_name`, `catalog.arabic_name`, `catalog.english_brand`, etc. were never added to `src/lib/translations.ts`. The UI shows the raw key strings instead of proper labels.

Additionally, the Brand dialog uses `catalog.english_brand` / `catalog.arabic_brand` as labels, but since these are name fields of the brand entity, they should display "English Name" / "Arabic Name" (not "English Brand" / "Arabic Brand").

## Changes

### 1. `src/lib/translations.ts` — Add missing keys

Add these translation entries:
- `catalog.english_name` → "English Name" / "الاسم بالإنجليزية"
- `catalog.arabic_name` → "Arabic Name" / "الاسم بالعربية"
- `catalog.english_description` → "English Description" / "الوصف بالإنجليزية"
- `catalog.arabic_description` → "Arabic Description" / "الوصف بالعربية"
- `catalog.english_color` → "English Color" / "اللون بالإنجليزية"
- `catalog.arabic_color` → "Arabic Color" / "اللون بالعربية"
- `catalog.english_brand` → "English Name" / "الاسم بالإنجليزية"
- `catalog.arabic_brand` → "Arabic Name" / "الاسم بالعربية"
- `catalog.size_from` → "Size From" / "المقاس من"
- `catalog.size_to` → "Size To" / "المقاس إلى"

Note: `catalog.english_brand` and `catalog.arabic_brand` translate to "English Name" / "Arabic Name" since they label the name attribute of the brand entity (not the word "brand" itself).

