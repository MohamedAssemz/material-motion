

## Add Comments Drawer to Order Details Page

This feature will add a timeline-based comments system to the order details page, allowing users to add notes that are saved with user details and timestamps.

---

### Overview

A "Comments" button will be added to the order details header. When clicked, it opens a drawer (sliding panel from the right) that displays:
- A form to add new comments
- A timeline view of all previous comments, showing the user who added them and when

---

### Database Changes

**Create new table: `order_comments`**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_id | uuid | Reference to the order |
| content | text | The comment text |
| created_by | uuid | User who created the comment |
| created_at | timestamp | When the comment was created |

**RLS Policies:**
- All authenticated users can view comments
- All authenticated users can create comments (any role can add notes)

---

### New Component

**File: `src/components/OrderCommentsDrawer.tsx`**

A drawer component that:
- Fetches all comments for the order, sorted newest first
- Shows each comment with:
  - User avatar/name
  - Timestamp (formatted as "Jan 28, 2026 at 3:45 PM")
  - Comment content
- Includes a form at the top to add new comments
- Uses the existing `Sheet` component for the drawer UI
- Displays comments in a scrollable timeline layout with visual connectors

---

### Integration

**File: `src/pages/OrderDetail.tsx`**

1. Add a "Comments" button in the header next to the existing "Raw Materials" button
2. Add state for controlling the drawer open/close
3. Import and render the new `OrderCommentsDrawer` component

---

### UI Design

The drawer will have:
- Header with "Comments" title and close button
- New comment form with a textarea and "Post Comment" button
- Timeline section showing all comments with:
  - Visual timeline connector line
  - User info (avatar with initials, name)
  - Relative or absolute timestamp
  - Comment content in a card-style container
  - Latest comment highlighted

---

### Technical Details

**Comment Timeline Pattern:**
```text
+---------------------------+
| Comments           [X]    |
+---------------------------+
| [Textarea for new comment]|
| [Post Comment]            |
+---------------------------+
| Timeline                  |
|  o-- User Name            |
|  |   Jan 28, 2026 3:45 PM |
|  |   "Comment content..." |
|  |                        |
|  o-- Another User         |
|  |   Jan 27, 2026 1:20 PM |
|  |   "Earlier comment..." |
+---------------------------+
```

**Files to create:**
- `src/components/OrderCommentsDrawer.tsx` - The drawer component

**Files to modify:**
- `src/pages/OrderDetail.tsx` - Add button and drawer state

**Database migration:**
- Create `order_comments` table with RLS policies

