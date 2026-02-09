/**
 * Shift-key corruption map: when hardware scanners send Shift+digit
 * due to timing overlap, these characters appear instead of digits.
 */
const SHIFT_CHAR_MAP: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
  '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
};

const SHIFT_CHARS_REGEX = /[!@#$%^&*()]/g;

/**
 * Sanitize shifted characters from scanner input.
 * E.g. "EBOX-0!01" -> "EBOX-0101" (then further normalized).
 */
const sanitizeShiftChars = (input: string): string =>
  input.replace(SHIFT_CHARS_REGEX, (ch) => SHIFT_CHAR_MAP[ch] || ch);

/**
 * Normalize box code input:
 * 1. Sanitize shift-key character corruptions from hardware scanners
 * 2. Extract BOX-#### or EBOX-#### from URLs or embedded strings
 * 3. Auto-prepend BOX- for pure numeric inputs
 * 4. Pass through mixed alphanumeric (product SKU/name search)
 *
 * Examples:
 * - "https://...com/box/BOX-0006" -> "BOX-0006" (URL extraction)
 * - "EBOX-0!01" -> "EBOX-0001" (shift-char sanitization)
 * - "42" -> "BOX-42"
 * - "BOX-42" -> "BOX-42"
 * - "box-42" -> "BOX-42"
 * - "ABC123" -> "ABC123" (mixed alphanumeric unchanged)
 */
export const normalizeBoxCode = (input: string): string => {
  // Step 1: Sanitize shift-character corruptions
  const sanitized = sanitizeShiftChars(input.trim());
  const upper = sanitized.toUpperCase();

  // Step 2: Try to extract BOX-#### or EBOX-#### from anywhere in the string (handles URLs)
  const boxMatch = upper.match(/(E?BOX-\w+)/);
  if (boxMatch) {
    return boxMatch[1];
  }

  // Step 3: Pure digits - prepend BOX-
  if (/^\d+$/.test(upper)) {
    return `BOX-${upper}`;
  }

  // Step 4: Mixed input (could be product SKU/name search) - return as-is
  return upper;
};
