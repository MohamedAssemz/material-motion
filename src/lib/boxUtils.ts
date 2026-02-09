/**
 * Normalize box code input by auto-prepending BOX- prefix for numeric inputs.
 * Allows users to enter just "42" instead of "BOX-42".
 * 
 * Examples:
 * - "42" -> "BOX-42"
 * - "0001" -> "BOX-0001" (preserves leading zeros)
 * - "BOX-42" -> "BOX-42" (already prefixed, unchanged)
 * - "box-42" -> "BOX-42" (case normalized)
 * - "EBOX-123" -> "EBOX-123" (extra box prefix preserved)
 * - "ABC123" -> "ABC123" (mixed alphanumeric unchanged, for product SKU search)
 * - "Plaster" -> "PLASTER" (product name search unchanged)
 */
export const normalizeBoxCode = (input: string): string => {
  const trimmed = input.trim().toUpperCase();
  
  // Already has valid prefix - return as-is
  if (/^(EBOX-|BOX-)/.test(trimmed)) {
    return trimmed;
  }
  
  // Pure digits - prepend BOX-
  if (/^\d+$/.test(trimmed)) {
    return `BOX-${trimmed}`;
  }
  
  // Mixed input (could be product SKU/name search) - return as-is
  return trimmed;
};
