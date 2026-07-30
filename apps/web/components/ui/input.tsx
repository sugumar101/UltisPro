import * as React from 'react';
import { cn } from '../../lib/cn';

/**
 * Kept as an exported string because several pages style raw `<select>` and
 * `<textarea>` elements with it directly. Defined once in globals.css as
 * `.field-base` so every control shares the same border/hover/focus
 * treatment.
 */
export const inputClassName = 'field-base';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClassName, className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClassName, 'resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(inputClassName, className)} {...props} />,
);
Select.displayName = 'Select';
