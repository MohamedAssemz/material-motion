import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, min, max, placeholder = "0", className, onBlur, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState<string>(
      value !== undefined ? String(value) : ""
    );

    // Sync from parent when value prop changes externally
    React.useEffect(() => {
      const numInternal = internalValue === "" ? undefined : parseInt(internalValue);
      if (numInternal !== value) {
        setInternalValue(value !== undefined ? String(value) : "");
      }
      // Only sync when the prop value changes, not internal
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInternalValue(raw);

      if (raw === "" || raw === "-") {
        onValueChange(undefined);
        return;
      }

      const parsed = parseInt(raw);
      if (!isNaN(parsed)) {
        // Apply max constraint while typing to prevent overshoot
        const clamped = max !== undefined ? Math.min(parsed, max) : parsed;
        onValueChange(clamped);
        if (clamped !== parsed) {
          setInternalValue(String(clamped));
        }
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // On blur, coerce empty to undefined or clamp
      if (internalValue === "" || internalValue === "-") {
        // Leave as empty — parent decides if it needs a default
        onValueChange(undefined);
      } else {
        const parsed = parseInt(internalValue);
        if (!isNaN(parsed)) {
          let clamped = parsed;
          if (min !== undefined) clamped = Math.max(clamped, min);
          if (max !== undefined) clamped = Math.min(clamped, max);
          setInternalValue(String(clamped));
          onValueChange(clamped);
        } else {
          setInternalValue("");
          onValueChange(undefined);
        }
      }
      onBlur?.(e);
    };

    return (
      <Input
        ref={ref}
        type="number"
        value={internalValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        min={min}
        max={max}
        className={className}
        {...props}
      />
    );
  }
);

NumericInput.displayName = "NumericInput";

export { NumericInput };
export type { NumericInputProps };
