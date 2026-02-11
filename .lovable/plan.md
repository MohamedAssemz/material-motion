
## One Label Per Page When Printing

### Summary
Add a CSS `page-break-after: always` rule to each `.label` element in the print HTML so every box label prints on its own page.

### Technical Details

**File: `src/components/BoxLabel.tsx`**

In the `generateBoxLabelHTML` function, update the `.label` CSS class to add `page-break-after: always` and remove the flex-wrap layout from `.labels-container` since labels will now flow one per page. Also remove `page-break-after` from the last label to avoid a trailing blank page.

Changes to the `<style>` block:
- `.labels-container`: remove `display: flex`, `flex-wrap: wrap`, `gap`, and `justify-content` (no longer needed since each label is on its own page)
- `.label`: add `page-break-after: always`, center on page with `margin: 0 auto`
- `.label:last-child`: add `page-break-after: avoid` to prevent a trailing blank page

| File | Change |
|------|--------|
| `src/components/BoxLabel.tsx` | Add `page-break-after: always` to `.label`, remove flex-wrap from container, prevent trailing blank page |
