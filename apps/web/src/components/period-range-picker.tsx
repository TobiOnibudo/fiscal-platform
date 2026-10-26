"use client";

import { useMemo, useState } from "react";
import { CalendarDays, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  const byValue = useMemo(
    () => new Map(sorted.map((period) => [period.value, period])),
    [sorted],
  );
  const rangeLabel =
    from && to
      ? from === to
        ? (byValue.get(from)?.label ?? from)
        : `${byValue.get(from)?.label ?? from} – ${byValue.get(to)?.label ?? to}`
      : "Choose fiscal periods";
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
    const nextIndex = sorted.findIndex((period) => period.value === value);
    const startIndex = Math.min(anchorIndex, nextIndex);
    const endIndex = Math.max(anchorIndex, nextIndex);
    onChange(sorted[startIndex].value, sorted[endIndex].value);
    setAnchor(null);
    setOpen(false);
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
          className="min-w-44 justify-start font-normal"
          disabled={disabled || sorted.length === 0}
          aria-label={`Fiscal period range: ${rangeLabel}`}
        >
          <CalendarDays data-icon="inline-start" />
          {rangeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="period-picker-popover">
        <div className="period-picker-heading">
          <div>
            <p>Fiscal period range</p>
            <span>
              {anchor
                ? `Now choose an end year after ${byValue.get(anchor)?.label ?? anchor}.`
                : "Choose a start year, then an end year."}
            </span>
          </div>
          {first && last ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(first.value, last.value);
                setAnchor(null);
                setOpen(false);
              }}
            >
              <RotateCcw data-icon="inline-start" />
              All periods
            </Button>
          ) : null}
        </div>
        <div
          className="period-year-grid"
          role="group"
          aria-label="Fiscal years"
        >
          {sorted.map((period, index) => {
            const selectedYear =
              fromIndex >= 0 &&
              toIndex >= 0 &&
              index >= fromIndex &&
              index <= toIndex;
            const isAnchor = anchor === period.value;
            return (
              <Button
                key={`${period.value}-${period.date}`}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "period-year-button",
                  selectedYear && "period-year-button-selected",
                  isAnchor && "period-year-button-anchor",
                )}
                aria-pressed={isAnchor}
                onClick={() => selectYear(period.value)}
              >
                {period.label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
