
Fix the Packaging completed-tab production rate so special items are excluded unless Packaging is their actual initial phase.

What I’ll change

1. Tighten Packaging production-rate filtering
- File: `src/pages/OrderPackaging.tsx`
- Replace the current special-item rule in `processedBatchesForRate`.
- Right now Packaging still counts special items whose `initial_state` is `in_manufacturing` or `in_finishing`, which is why skipped items appear under Production Rate.
- New rule:
  - normal items: keep existing behavior
  - special items: count only when `order_item.initial_state === "in_packaging"`

2. Audit completed-tab source data in Packaging
- Make sure the data passed into `<ProductionRateSection />` comes only from that stricter `processedBatchesForRate` list plus real packaging extra-history items.
- Keep retrieved-from-extra items separate in the dedicated retrieved section, not mixed into Packaging’s processed rate.

3. Prevent similar inconsistency in Packaging metrics
- Verify that Packaging’s “completed” grouping can still show moved-forward items if intended, but the Production Rate block must only reflect items actually processed in Packaging.
- If the same loose special-item rule appears in nearby Packaging-derived counts, align it with the same strict “initial phase only” rule.

Technical detail
- Correct rule for special items:
  - Manufacturing rate: only `in_manufacturing`
  - Finishing rate: only `in_finishing`
  - Packaging rate: only `in_packaging`
  - Boxing rate: exclude special items entirely
- For this specific bug, the key fix is in `OrderPackaging.tsx`, where the current filter is too permissive.

Expected result
- In `TEST SPECIAL 3`, the Packaging Completed tab will no longer show those 50 skipped special items in the Production Rate section.
- Only items that were actually processed in Packaging will be shown there.
