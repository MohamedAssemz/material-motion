

## Convert Raw Materials Timeline to a Drawer

This change will transform the current Raw Materials Dialog (modal popup) into a Drawer that matches the design and interaction pattern of the recently implemented Comments Drawer.

---

### Overview

The Raw Materials feature will be converted from a centered modal dialog to a sliding drawer panel from the right side of the screen. This creates a consistent user experience with the Comments feature and provides a more modern, less intrusive interface.

---

### Changes Overview

**File: `src/components/RawMaterialsDialog.tsx`**

This file will be completely refactored into a new component `RawMaterialsDrawer.tsx` (rename/replace):

1. **Replace Dialog with Sheet component**
   - Change from `Dialog/DialogContent/DialogHeader/DialogTitle` to `Sheet/SheetContent/SheetHeader/SheetTitle`
   - Use same width and layout as Comments drawer (`w-full sm:max-w-md flex flex-col`)

2. **Update component props**
   - Add `orderNumber` prop to display in the drawer title (matching Comments pattern)
   - Keep existing `orderId`, `open`, `onOpenChange` props

3. **Redesign the input form**
   - Move the "Add New Version" form to match Comments layout
   - Use same textarea styling with `min-h-[80px] resize-none`
   - Add keyboard shortcut support (Cmd/Ctrl+Enter to submit)
   - Change button from "Save Version" to "Post" with Send icon
   - Add helper text "Press Cmd+Enter to submit"
   - Keep the role-based visibility (only manufacture_lead and admin can add)

4. **Redesign the timeline view**
   - Use Avatar with user initials instead of icons
   - Add visual timeline line connector (vertical line on the left)
   - Match the styling: latest version highlighted with primary color
   - Keep version badge but integrate into the new layout
   - Use same timestamp formatting as Comments

5. **Update loading states**
   - Use Skeleton components for loading (matching Comments pattern)
   - Same empty state message pattern

---

### Visual Design

The new drawer will have this structure:

```text
+---------------------------+
| Raw Materials - ORD-0001  |  [X]
+---------------------------+
| [Textarea for new version]|   <- Only visible for leads/admin
| Press ⌘+Enter to submit   |
|                    [Post] |
+---------------------------+
| Timeline                  |
|  o-- User Name      v3    |
|  |   Jan 28, 2026         |
|  |   "Version content..." |
|  |                        |
|  o-- Another User   v2    |
|  |   Jan 27, 2026         |
|  |   "Earlier version..." |
+---------------------------+
```

---

### File Changes

**Rename/Recreate: `src/components/RawMaterialsDialog.tsx` -> `src/components/RawMaterialsDrawer.tsx`**
- Use Sheet component instead of Dialog
- Add orderNumber prop
- Match OrderCommentsDrawer design patterns:
  - Avatar with initials
  - Timeline line connector
  - Highlighted latest entry
  - Keyboard shortcut support
  - Skeleton loading states

**Modify: `src/pages/OrderDetail.tsx`**
- Update import from `RawMaterialsDialog` to `RawMaterialsDrawer`
- Update component usage to pass `orderNumber` prop
- Component remains in same location with same state management

---

### Technical Details

**Key import changes in the drawer:**
```typescript
// From
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// To
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';
```

**Timeline entry structure:**
- Avatar with user initials (highlighted for latest)
- User name and timestamp on first line
- Version badge (e.g., "v3") inline with user info
- Content in a rounded card below

**Keyboard shortcut:**
```typescript
onKeyDown={(e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    handleSave();
  }
}}
```

