import { Search, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { RosterView } from "~/modules/course-roster";

export function RosterToolbar({
  view,
  onChange,
  onClear,
}: {
  view: RosterView;
  onChange: (changes: Partial<RosterView>) => void;
  onClear: () => void;
}) {
  const filtered = view.q !== "" || view.from !== "" || view.to !== "";

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search students by name or email"
          placeholder="Search by name or email..."
          value={view.q}
          onChange={(event) => onChange({ q: event.target.value })}
          className="pl-9"
        />
      </div>
      <DateField
        label="Enrolled from"
        value={view.from}
        max={view.to || undefined}
        onChange={(from) => onChange({ from })}
      />
      <DateField
        label="Enrolled to"
        value={view.to}
        min={view.from || undefined}
        onChange={(to) => onChange({ to })}
      />
      {filtered && (
        <Button variant="ghost" onClick={onClear}>
          <X className="mr-1 size-4" />
          Clear
        </Button>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="w-40"
      />
    </label>
  );
}
