'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string; type?: string }>;
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, options, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
