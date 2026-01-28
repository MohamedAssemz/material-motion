
Goals
1) In the Scan popup (BoxScanPopup), keep scanning “always-on” so you can scan multiple barcodes back-to-back without clicking the input.
2) On the Warehouse page (/boxes), enable “batch lookup” so scanning either:
   - a box barcode (e.g., BOX-0001 / EBOX-0001), or
   - a QR code that contains a URL (e.g., https://…/box/BOX-0001 or https://…/batch/B-XXXXXXXX)
   will open the Box Details popup for the relevant box.

--------------------------------------------------------------------
A) Fix: Scan popup input loses focus after a scan
--------------------------------------------------------------------
What’s happening (root cause)
- In src/components/BoxScanPopup.tsx the scan <Input> is currently disabled while validating:
  disabled={validating}
- Browsers forcibly remove focus from a disabled input. Then in finally{} we call inputRef.current?.focus(), but at that exact moment React hasn’t necessarily re-rendered yet (so the input may still be disabled), causing the focus call to fail. That’s why the next scan “does nothing”.

Implementation approach (robust, factory-friendly)
We’ll implement two layers:
1) Prevent focus loss in the first place
2) Add a fallback “global scanner listener” in the popup so scans still work even if focus ever moves to a button (e.g., after clicking remove)

Changes in src/components/BoxScanPopup.tsx
1) Keep the input focusable during validation
   - Remove disabled={validating}
   - Optionally use readOnly={validating} (still focusable) or keep it editable but ignore submissions while validating.
   - Keep showing the spinner (Loader2) so the user sees “working…”.

2) Refocus after async validation in a way that waits for React to re-render
   - Create a helper like focusInput() that uses requestAnimationFrame (or setTimeout(0)) to run after the DOM updates:
     - requestAnimationFrame(() => inputRef.current?.focus())
   - Call focusInput() in:
     - the “popup opened” effect
     - handleKeyDown right after clearing inputValue
     - validateAndAddBox finally block AFTER setting validating=false (but deferred via focusInput helper)

3) Add popup-level scanner fallback using the existing useBoxScanner hook
   - Import useBoxScanner into BoxScanPopup
   - Enable it when the popup is open:
     useBoxScanner({ onScan: validateAndAddBox, enabled: open })
   - Because useBoxScanner intentionally ignores events when an input/textarea is focused, it will not double-handle scans while the input is focused.
   - If focus ever lands on a button (Remove, Close, etc.), the hook will still catch the scan and call validateAndAddBox, making scanning reliable even without manually refocusing.

4) Optional quality-of-life: refocus after clicking remove
   - In handleRemoveBox(), after updating state, call focusInput() so the next scan works without clicking.

Expected behavior after this
- Scan popup opens: caret is in the input.
- Scan barcode #1: it validates, adds, and the caret remains ready for scan #2.
- Even if focus accidentally moves to a button, the next scan will still be captured via the popup scanner fallback.

--------------------------------------------------------------------
B) Feature: “Batch lookup” on Warehouse page (/boxes) to open box details
--------------------------------------------------------------------
What’s missing currently
- src/pages/Boxes.tsx already uses useBoxScanner and opens BoxDetailsDialog when the scanned code equals an existing box_code in the currently loaded lists.
- But QR codes on labels encode URLs like:
  - /box/BOX-0001 (box labels)
  - /batch/B-XXXXXXXX (batch cards)
  Scanners often output the full URL. Our current warehouse scan handler only matches exact box_code values.

Implementation approach
Enhance the scan handler on /boxes to:
1) Normalize the scanned text by extracting either:
   - box code: BOX-#### / EBOX-#### (or any length digits), OR
   - batch code: B-XXXXXXXX / EB-XXXXXXXX
   even if the scanned payload is a URL or contains extra characters.
2) If it’s a box code: open that box’s details (order or extra).
3) If it’s a batch code:
   - look up which box currently contains that batch in the database
   - open that box’s details dialog
   - if the batch is not currently in a box (box_id is null), show a clear toast.

Changes in src/pages/Boxes.tsx
1) Update handleBoxScan to accept raw scanner data and extract codes using regex
   - Example extraction logic (conceptual):
     - const boxMatch = raw.toUpperCase().match(/(EBOX-\d+|BOX-\d+)/)
     - const batchMatch = raw.toUpperCase().match(/(EB-[A-Z0-9]{8}|B-[A-Z0-9]{8})/)
   - Prefer boxMatch first; else batchMatch; else show “Unrecognized scan”.

2) Box scan path (BOX- / EBOX-)
   - First try to find in the already-loaded orderBoxes / extraBoxes arrays (fast path).
   - If not found locally (possible when lists are stale/large), do a backend lookup:
     - Query order boxes table by box_code
     - If not found, query extra boxes table by box_code
   - Open BoxDetailsDialog with the returned metadata (created_at, is_active, content_type).
   - For primaryState (badge color), either:
     - set null (dialog still works), or
     - query one batch state for that box to display a badge. (Nice-to-have.)

3) Batch scan path (B- / EB-)
   - Query order_batches where qr_code_data == scanned batch code:
     - If found and box_id exists: open that order box’s details.
     - If found but box_id is null: toast “This batch isn’t currently in a box”.
   - If not found in order_batches, query extra_batches similarly (extra box).
   - If not found anywhere: toast “Batch not found”.

4) Ensure scanner remains disabled while dialogs are open (keep current behavior)
   - Keep:
     enabled: !detailsOpen && !dialogOpen && !extraDialogOpen && !printDialogOpen

Expected behavior after this
- On /boxes, scanning:
  - BOX-0001 opens Order Box details
  - EBOX-0001 opens Extra Box details
  - a QR code that contains “…/box/BOX-0001” opens Order Box details
  - a batch QR that contains “…/batch/B-XXXXXXXX” opens the box containing that batch (if any)

--------------------------------------------------------------------
Files to change
1) src/components/BoxScanPopup.tsx
   - Remove disabling the input during validation
   - Add deferred focus helper (requestAnimationFrame / setTimeout)
   - Add popup-level useBoxScanner fallback
   - Optional: refocus after remove

2) src/pages/Boxes.tsx
   - Enhance handleBoxScan to:
     - extract box codes from URL-like scan data
     - support batch-code scans by resolving to a box then opening details
     - optionally fallback to backend lookup when the box isn’t in the loaded arrays

No backend schema changes needed.

--------------------------------------------------------------------
Test checklist (end-to-end)
1) Production phase (e.g., /orders/:id/boxing → Receive tab → Scan):
   - Scan BOX-xxxx: gets added; caret remains in the input.
   - Scan multiple boxes back-to-back without clicking: all are added.
   - Click the “remove” X on a scanned entry, then scan again: scan still works (focus returns or fallback scanner catches it).

2) Warehouse (/boxes):
   - Scan a printed barcode “BOX-0001”: opens details.
   - Scan the QR code from the same label (URL payload): opens details.
   - Scan a batch QR (URL payload): opens the box details if the batch is currently assigned to a box; otherwise shows a clear “not in a box” message.

Notes / edge cases
- If a batch is in processing and has no box assigned (box_id null), we will not be able to open a box details popup; we’ll show a toast instead.
- If your box list is large and the scanned box isn’t in the first page of loaded data, the new backend fallback lookup ensures scanning still works reliably.

