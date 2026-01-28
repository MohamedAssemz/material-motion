

## Remove State Column and Delete Option from Box Details Dialog

Based on the provided context that all items in a box must share the same state (shown in the dialog header), the following changes will simplify the UI.

---

### Changes Overview

**File: `src/components/BoxDetailsDialog.tsx`**

1. **Remove State Column from Order Boxes Table**
   - Remove the "State" column header from line 262
   - Remove the State cell from each row (lines 276-280)

2. **Remove State Column from Extra Boxes Table**
   - Remove the "State" column header from line 293
   - Remove the State cell from each row (lines 308-312)
   - Keep the "Inv State" (Inventory State) column as it shows AVAILABLE/RESERVED status which varies per batch

3. **Remove Delete Button and Related Logic**
   - Remove the Delete Box button from the dialog footer (lines 330-338)
   - Remove the AlertDialog for delete confirmation (lines 346-372)
   - Remove the `deleteDialogOpen` and `deleting` state variables (lines 75-76)
   - Remove the `handleDelete` function (lines 141-168)
   - Remove the `Trash2` icon import
   - Remove the `onDeleted` prop since it will no longer be needed

---

### Technical Details

The state is already displayed in the dialog header via the `getStatusBadge()` function which shows the `primaryState` as a colored badge. Since all batches in a box share the same state (per the constraint documented in the useful context), displaying it redundantly per row adds no value.

For extra boxes, the "Inv State" column will remain because individual batches can have different inventory states (AVAILABLE vs RESERVED) even within the same box.

