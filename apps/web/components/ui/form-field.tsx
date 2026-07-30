import * as React from 'react';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div>
      <label className="text-label-sm font-semibold text-on-surface-variant" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-sm text-error">{error}</p> : null}
    </div>
  );
}
