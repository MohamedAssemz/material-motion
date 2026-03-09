
## Plan: Machine Production Rate Analytics

### What we're building
1. A new **"Machine Production"** tab in Reports & Analytics
2. Enhanced **"Most Used Machines"** dashboard card with machine type, a mini production bar, and a deep-link to the new tab

---

### 1. New file: `src/components/reports/MachineProductionTab.tsx`

Self-contained component that fetches its own data (avoids bloating `Reports.tsx`).

**Data sources:**
- `machine_production`: `id, machine_id, state_transition, created_at`
- `machines`: `id, name, type`

**Filters:**
- Date preset (Today / This Week / Last 30 Days / Last 90 Days) + custom date pickers
- Machine type (All / Manufacturing / Finishing / Packaging / Boxing)

**Charts & sections:**

| Section | Type | Description |
|---|---|---|
| A | Horizontal bar | Total ops per machine, sorted descending, colored by type |
| B | Stacked bar by day | Daily production trend, stacked by machine type |
| C | Grouped bar | Per-machine-type phase breakdown (start vs finish ops) |
| D | Ranked table | Machine name, type badge, total ops, trend indicator |

**Phase derivation from `state_transition`:**
- `start_manufacturing` / `finish_manufacturing` → Manufacturing
- `start_finishing` / `finish_finishing` → Finishing
- `start_packaging` / `finish_packaging` → Packaging
- `start_boxing` / `finish_boxing` → Boxing

---

### 2. Update `src/pages/Reports.tsx`

- Import `MachineProductionTab` and `Wrench` icon
- Add 5th tab: `machine-production` with `Wrench` icon, label "Machine Rate"
- Change `grid-cols-4` → `grid-cols-5` on the `TabsList`
- Add `<TabsContent value="machine-production"><MachineProductionTab /></TabsContent>`

No new data props needed — the tab is self-fetching.

---

### 3. Update `src/pages/Dashboard.tsx` — "Most Used Machines" card

**Data change:**
- Change `supabase.from('machines').select('id, name')` → `select('id, name, type')`
- Update `topMachines` type to `{ name: string; count: number; type: string }`

**Card UI changes:**
- Add a small colored type badge next to each machine name (blue=Manufacturing, purple=Finishing, indigo=Packaging, cyan=Boxing)
- Show a mini horizontal progress bar per machine (relative to the top machine count)
- Add "See detailed analytics →" link at the bottom of the card that navigates to `/reports?tab=machine-production`

---

### Technical notes
- No database changes needed — `machine_production` already has all required columns
- `MachineProductionTab` uses `useMemo` for all derived data (totals, daily trend, phase breakdown)
- The tab is consistent with the pattern in `CatalogInsightsTab` (self-contained date filter + memoized aggregation)
