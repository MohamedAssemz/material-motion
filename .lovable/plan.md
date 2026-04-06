

# Redesign Raw Materials Drawer for 10-20+ Order Items

## Problem
The current horizontal tab bar becomes unusable with 10-20 order items — tabs overflow and are hard to navigate.

## Approach: Searchable Dropdown + Item List View

Replace the horizontal tab bar with two navigation modes:

### Default view ("All Items")
A **compact card list** showing each order item with its latest raw material status (has entries or not), acting as a dashboard. Clicking an item card opens that item's detail view inline.

### Item detail view
When an item is selected (via the list or a **searchable select dropdown** at the top), the drawer shows that item's timeline + post form. A back button returns to the list.

```text
┌─────────────────────────────────────────┐
│  Raw Materials - ORD-00123              │
├─────────────────────────────────────────┤
│  [← Back to list]   [▼ Jump to item…]  │  ← searchable dropdown for quick jump
├─────────────────────────────────────────┤
│  Product A - S                          │
│  ┌─ Post new version ───────────────┐   │
│  │ [textarea]           [Post]      │   │
│  └──────────────────────────────────┘   │
│  Timeline...                            │
└─────────────────────────────────────────┘
```

### List view (default):
```text
┌─────────────────────────────────────────┐
│  Raw Materials - ORD-00123              │
├─────────────────────────────────────────┤
│  🔍 Search items...                     │
├─────────────────────────────────────────┤
│  ┌─ Product A - S ──────── 3 updates ─┐ │
│  │  Latest: "Updated fabric..."  →    │ │
│  ├─ Product B - M ──────── No entries ┤ │
│  │  No raw materials yet         →    │ │
│  ├─ Product C - L ──────── 1 update ──┤ │
│  │  Latest: "Initial specs..."   →    │ │
│  └────────────────────────────────────┘ │
│  (legacy order-level notes at bottom)   │
└─────────────────────────────────────────┘
```

## Changes

### File: `src/components/RawMaterialsItemDrawer.tsx`
- Replace horizontal tab bar with a **two-mode view** (list vs detail)
- **List mode** (default): Scrollable list of all order items as clickable cards, each showing product name + size, SKU, version count, and a snippet of the latest entry. Include a text filter/search input at top to filter items by name/SKU.
- **Detail mode**: Shows when an item is selected. Includes a back button to return to the list, a searchable select dropdown (using existing `Select` or combobox) for quick jumping between items, the post form (admin), and the timeline.
- Legacy order-level notes shown as a separate section at the bottom of the list view.
- No other files need changes — the props interface stays the same.

