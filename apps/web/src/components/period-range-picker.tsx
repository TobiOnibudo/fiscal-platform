"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type FiscalPeriodOption = {
  value: string;
  label: string;
  date: string;
};

export function PeriodRangePicker({
  periods,
  from,
  to,
  onChange,
  disabled = false,
  align = "end",
}: {
  periods: FiscalPeriodOption[];
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const sorted = useMemo(
    () =>
      [...periods].sort((left, right) => left.date.localeCompare(right.date)),
    [periods],
  );
  const yearByValue = useMemo(
    () =>
      new Map(sorted.map((period) => [period.value, period.date.slice(0, 4)])),
    [sorted],
  );
  const rangeLabel =
    from && to
      ? from === to
        ? (yearByValue.get(from) ?? from)
        : `${yearByValue.get(from) ?? from}–${yearByValue.get(to) ?? to}`
      : "Select years";
  const first = sorted[0];
  const last = sorted.at(-1);
  const fromIndex = sorted.findIndex((period) => period.value === from);
  const toIndex = sorted.findIndex((period) => period.value === to);

  function selectYear(value: string) {
    if (!anchor) {
      setAnchor(value);
      return;
    }

    const anchorIndex = sorted.findIndex((period) => period.value === anchor);
    const selectedIndex = sorted.findIndex((period) => period.value === value);
    const startIndex = Math.min(anchorIndex, selectedIndex);
    const endIndex = Math.max(anchorIndex, selectedIndex);

    onChange(sorted[startIndex].value, sorted[endIndex].value);
    setAnchor(null);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setAnchor(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-0 justify-start px-2.5 font-normal"
          disabled={disabled || sorted.length === 0}
          aria-label={`Fiscal year range: ${rangeLabel}`}
        >
          <CalendarRange data-icon="inline-start" />
          {rangeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="period-picker-popover">
        <div className="period-picker-heading">
          <p>Fiscal years</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!first || !last}
            onClick={() => {
              if (first && last) onChange(first.value, last.value);
              setAnchor(null);
            }}
          >
            All years
          </Button>
        </div>
        <div
          className="period-picker-grid"
          role="group"
          aria-label="Fiscal years"
        >
          {sorted.map((period, index) => {
            const selected = anchor
              ? period.value === anchor
              : index >= fromIndex && index <= toIndex;

            return (
              <Button
                key={period.value}
                type="button"
                size="sm"
                variant={selected ? "default" : "ghost"}
                aria-pressed={selected}
                onClick={() => selectYear(period.value)}
              >
                {yearByValue.get(period.value)}
              </Button>
            );
          })}
        </div>
        <span className="sr-only" aria-live="polite">
          {anchor
            ? `${yearByValue.get(anchor) ?? anchor} selected. Choose another year to complete the range.`
            : `Fiscal year range ${rangeLabel} selected.`}
        </span>
      </PopoverContent>
    </Popover>
  );
}
