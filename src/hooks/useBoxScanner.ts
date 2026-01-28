import { useEffect, useRef, useCallback } from 'react';

interface UseBoxScannerOptions {
  /** Callback when a code is scanned */
  onScan: (code: string) => void;
  /** Enable/disable scanner detection */
  enabled?: boolean;
  /** Minimum characters to be considered valid scan */
  minLength?: number;
  /** Max delay between keystrokes in ms (scanners are fast) */
  maxDelay?: number;
  /** Timeout to clear buffer after no input */
  bufferTimeout?: number;
}

/**
 * Custom hook to detect hardware barcode/QR scanner input
 * 
 * Hardware scanners typically:
 * 1. Type characters very rapidly (< 50ms between keystrokes)
 * 2. End with an Enter key press
 * 
 * This hook buffers rapid keystrokes and triggers onScan when Enter is pressed.
 */
export function useBoxScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxDelay = 50,
  bufferTimeout = 200,
}: UseBoxScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBuffer = useCallback(() => {
    bufferRef.current = '';
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if focus is on an input, textarea, or contenteditable
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement?.getAttribute('contenteditable') === 'true'
    ) {
      return;
    }

    const now = Date.now();
    const timeSinceLastKey = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    // Clear buffer if too much time has passed
    if (timeSinceLastKey > bufferTimeout && bufferRef.current.length > 0) {
      clearBuffer();
    }

    // Handle Enter key
    if (event.key === 'Enter') {
      const scannedCode = bufferRef.current.trim();
      
      if (scannedCode.length >= minLength) {
        // This looks like a scanner input
        event.preventDefault();
        event.stopPropagation();
        onScan(scannedCode.toUpperCase());
      }
      
      clearBuffer();
      return;
    }

    // Only accept alphanumeric and common barcode characters
    if (event.key.length === 1 && /^[a-zA-Z0-9\-_]$/.test(event.key)) {
      // Check if this keystroke came fast enough to be from a scanner
      const isFastEnough = timeSinceLastKey <= maxDelay || bufferRef.current.length === 0;
      
      if (isFastEnough) {
        bufferRef.current += event.key;
        
        // Reset timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(clearBuffer, bufferTimeout);
      } else {
        // Too slow - probably manual typing, clear and start fresh
        bufferRef.current = event.key;
      }
    }
  }, [enabled, minLength, maxDelay, bufferTimeout, onScan, clearBuffer]);

  useEffect(() => {
    if (!enabled) {
      clearBuffer();
      return;
    }

    window.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearBuffer();
    };
  }, [enabled, handleKeyDown, clearBuffer]);

  return {
    /** Manually clear the scan buffer */
    clearBuffer,
  };
}
