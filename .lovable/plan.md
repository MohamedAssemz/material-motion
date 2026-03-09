

## Remove Notifications

### Changes

1. **Database Migration** — Drop the `notifications` table.

2. **Delete `src/components/NotificationBell.tsx`** — Remove the entire file.

3. **Edit `src/components/AppLayout.tsx`** — Remove the `NotificationBell` import and its usage in the header (`<NotificationBell />`).

