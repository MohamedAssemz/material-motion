

## Add Explicit Box State Validation on Scan in Receive Tab

This change enhances the barcode scanning validation in the receive tab of production phases (Finishing, Packaging, Boxing). When scanning boxes, each scanned box will be explicitly validated to confirm it's in the expected "ready" state before being accepted.

---

### Overview

Currently, the `BoxReceiveDialog` component validates scanned boxes by checking if they exist in the pre-fetched `allBoxes` list (which is already filtered by `filterState`). However, this validation happens implicitly. The user wants explicit validation where each scanned box is individually checked against the database to confirm it's in the expected state.

This change will:
1. Perform an explicit database check for each scanned box
2. Verify the box contains batches in the correct `filterState`
3. Provide clear feedback when a box fails validation
4. Support multiple consecutive scans with individual validation per box

---

### Files to Modify

**`src/components/BoxReceiveDialog.tsx`**

Update the `handleBoxScan` callback function to:

1. When a box code is scanned:
   - First check if already selected (existing logic)
   - Query the database directly to fetch the box and its associated batches
   - Validate that the box exists and is active
   - Validate that the box contains batches in the expected `filterState` for this specific order
   - If valid, add to selected boxes
   - If invalid, show a descriptive error toast explaining why (wrong state, different order, empty box, etc.)

2. The enhanced validation will check:
   - Box exists and is active
   - Box has batches assigned to it
   - Batches belong to the correct order (`orderId`)
   - Batches are in the expected state (`filterState`)
   - Batches are not terminated

---

### Current Flow (Before Change)

```text
Box Scanned -> Check if in allBoxes (pre-filtered list)
           -> If found: Add to selection
           -> If not found: Check if box exists, show generic error
```

### New Flow (After Change)

```text
Box Scanned -> Check if already selected
           -> Query database for box with batches
           -> Validate:
              ✓ Box exists and is active
              ✓ Box has batches for this order
              ✓ Batches are in expected state (filterState)
              ✓ Batches are not terminated
           -> If all pass: Add to selection with success toast
           -> If any fail: Show specific error toast:
              - "Box not found or inactive"
              - "Box is empty"
              - "Box does not contain items for this order"
              - "Box items are in [actual state], expected [expected state]"
```

---

### Technical Implementation

The `handleBoxScan` function will be updated as follows:

```typescript
const handleBoxScan = useCallback(async (code: string) => {
  // Check if already selected
  const alreadySelected = selectedBoxes.find(b => b.box_code.toUpperCase() === code);
  if (alreadySelected) {
    toast({ title: 'Already Selected', description: `Box ${code} is already selected` });
    return;
  }

  // Explicit database validation
  const { data: box } = await supabase
    .from('boxes')
    .select('id, box_code')
    .eq('box_code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!box) {
    toast({ title: 'Box Not Found', description: `No active box found with code "${code}"`, variant: 'destructive' });
    return;
  }

  // Fetch batches in this box for this order
  const { data: batches } = await supabase
    .from('order_batches')
    .select(`id, product_id, quantity, current_state, product:products(id, name, sku)`)
    .eq('box_id', box.id)
    .eq('order_id', orderId)
    .eq('is_terminated', false);

  if (!batches || batches.length === 0) {
    toast({ title: 'Empty or Wrong Order', description: `Box ${code} has no items for this order`, variant: 'destructive' });
    return;
  }

  // Check if all batches are in the expected state
  const validBatches = batches.filter(b => b.current_state === filterState);
  const invalidBatches = batches.filter(b => b.current_state !== filterState);

  if (validBatches.length === 0) {
    const actualState = batches[0].current_state;
    toast({
      title: 'Wrong State',
      description: `Box ${code} items are in "${getStateLabel(actualState)}" state, expected "${getStateLabel(filterState)}"`,
      variant: 'destructive',
    });
    return;
  }

  // Box is valid - add to selection
  const selectedBox: SelectedBox = {
    id: box.id,
    box_code: box.box_code,
    batches: validBatches.map(b => ({
      id: b.id,
      product_id: b.product_id,
      product_name: (b.product as any)?.name || 'Unknown',
      product_sku: (b.product as any)?.sku || 'N/A',
      quantity: b.quantity,
    })),
    total_quantity: validBatches.reduce((sum, b) => sum + b.quantity, 0),
  };

  setSelectedBoxes(prev => [...prev, selectedBox]);
  toast({ title: 'Box Accepted', description: `Box ${code} validated and added (${selectedBox.total_quantity} items)` });
}, [selectedBoxes, orderId, filterState, toast]);
```

---

### Validation Error Messages

| Scenario | Error Message |
|----------|---------------|
| Box not found | "No active box found with code 'XXX'" |
| Box inactive | Same as above |
| Box has no batches for this order | "Box XXX has no items for this order" |
| Batches in wrong state | "Box XXX items are in 'In Finishing' state, expected 'Ready for Finishing'" |
| Already selected | "Box XXX is already selected" |

---

### Benefits

1. **Explicit Validation**: Each scan triggers a fresh database check, ensuring data consistency
2. **Clear Feedback**: Users receive specific error messages explaining why a box was rejected
3. **Multi-scan Support**: Each box is independently validated, supporting workflows where multiple boxes are scanned consecutively
4. **Order Isolation**: Validates that the box contents belong to the current order
5. **State Verification**: Ensures items are in the exact expected state before acceptance

---

### No Changes Required

- `useBoxScanner.ts` - Hook works correctly, no changes needed
- Database schema - No changes required
- Other dialog components - This change is specific to `BoxReceiveDialog`

