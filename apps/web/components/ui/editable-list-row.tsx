'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Input } from './input';

export interface EditableField {
  key: string;
  label: string;
  value: string;
  /** Narrow numeric/short fields so a rate or symbol doesn't get a full-width box. */
  width?: string;
  placeholder?: string;
}

interface EditableListRowProps {
  /** Read-mode content — whatever the list normally shows for this row. */
  children: ReactNode;
  fields: EditableField[];
  canManage: boolean;
  busy?: boolean;
  onSave: (values: Record<string, string>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Shown in the delete confirmation, e.g. `the "Topwear" category`. */
  deleteLabel: string;
  /** Extra warning appended to the confirm dialog when deletion has knock-on effects. */
  deleteWarning?: string;
}

/**
 * One row of a master-data list (categories, brands, units, taxes, product
 * types...) that can flip between read mode and an inline edit form, plus a
 * delete action behind a confirmation.
 *
 * Inline editing rather than a modal or a separate page: these are all
 * one-to-four-field records, and the list itself is the useful context —
 * renaming "Topwear" is easier when you can see the other categories.
 */
export function EditableListRow({
  children,
  fields,
  canManage,
  busy = false,
  onSave,
  onDelete,
  deleteLabel,
  deleteWarning,
}: EditableListRowProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState(false);

  function startEditing() {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    setEditing(true);
  }

  async function handleSave() {
    setRowBusy(true);
    try {
      await onSave(values);
      setEditing(false);
    } finally {
      setRowBusy(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${deleteLabel}?${deleteWarning ? `\n\n${deleteWarning}` : ''}`,
    );
    if (!confirmed) return;

    setRowBusy(true);
    try {
      await onDelete();
    } finally {
      setRowBusy(false);
    }
  }

  const disabled = busy || rowBusy;

  if (editing) {
    return (
      <li className="rounded border border-primary p-3">
        <div className="space-y-2">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-label-sm font-semibold text-on-surface-variant">{field.label}</label>
              <Input
                className={field.width}
                placeholder={field.placeholder}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={disabled} onClick={handleSave}>
              {disabled ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded border border-outline-variant p-3">
      <div className="min-w-0 flex-1">{children}</div>
      {canManage ? (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={startEditing}>
            Edit
          </Button>
          <Button size="sm" variant="destructive" disabled={disabled} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </li>
  );
}
