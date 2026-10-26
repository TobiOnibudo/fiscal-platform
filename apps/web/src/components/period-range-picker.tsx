"use client";

import { useId, useMemo } from "react";
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
  const fromId = useId();
  const toId = useId();
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
  const selectedYearCount =
    fromIndex >= 0 && toIndex >= fromIndex ? toIndex - fromIndex + 1 : 0;

  return (
    <Popover>
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
          <div>
            <p>Fiscal years</p>
            <span>Changes update the view immediately.</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!first || !last}
            onClick={() => {
              if (first && last) onChange(first.value, last.value);
            }}
          >
            All years
          </Button>
        </div>
        <fieldset className="period-picker-fields">
          <legend className="sr-only">Fiscal year range</legend>
          <label htmlFor={fromId}>
            <span>From</span>
            <select
              id={fromId}
              value={from}
              onChange={(event) => {
                const nextFrom = event.target.value;
                const nextFromIndex = sorted.findIndex(
                  (period) => period.value === nextFrom,
                );
                onChange(nextFrom, toIndex < nextFromIndex ? nextFrom : to);
              }}
            >
              {sorted.map((period) => (
                <option key={period.value} value={period.value}>
                  {yearByValue.get(period.value)}
                </option>
              ))}
            </select>
          </label>
          <span className="period-picker-separator" aria-hidden="true">
            –
          </span>
          <label htmlFor={toId}>
            <span>To</span>
            <select
              id={toId}
              value={to}
              onChange={(event) => {
                const nextTo = event.target.value;
                const nextToIndex = sorted.findIndex(
                  (period) => period.value === nextTo,
                );
                onChange(fromIndex > nextToIndex ? nextTo : from, nextTo);
              }}
            >
              {sorted.map((period) => (
                <option key={period.value} value={period.value}>
                  {yearByValue.get(period.value)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <p className="period-picker-summary" aria-live="polite">
          {selectedYearCount} {selectedYearCount === 1 ? "year" : "years"}
        </p>
      </PopoverContent>
    </Popover>
  );
}
