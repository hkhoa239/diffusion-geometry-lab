"use client";
// shadcn/ui-style primitives built on Radix, styled with Tailwind tokens.
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import katex from "katex";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tex({ math, block = false, className }: { math: string; block?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(math, { displayMode: block, throwOnError: false, strict: "ignore" }),
    [math, block]
  );
  return <span className={cn(block && "block overflow-x-auto py-1", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Tip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-ink-3 underline-offset-4">{children}</span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-snug text-ink-2 shadow-lg"
        >
          {tip}
          <TooltipPrimitive.Arrow className="fill-[var(--surface)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** A math symbol with an explanatory tooltip. */
export function Sym({ tex, tip }: { tex: string; tip: ReactNode }) {
  return (
    <Tip tip={tip}>
      <Tex math={tex} />
    </Tip>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
  accent = "var(--c-dist)",
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono tabular-nums text-ink">{format(value)}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-2">
          <SliderPrimitive.Range className="absolute h-full rounded-full" style={{ background: accent }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full border-2 bg-surface shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ borderColor: accent }}
          aria-label={typeof label === "string" ? label : "slider"}
        />
      </SliderPrimitive.Root>
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-ink-2">
      <span>{label}</span>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-surface-2 transition-colors data-[state=checked]:bg-[var(--c-dist)]"
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  className,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "ghost" | "primary";
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
        variant === "default" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2",
        variant === "primary" && "bg-ink text-bg hover:opacity-90",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-[13px] text-ink-2">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      {title && <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{title}</h3>}
      {children}
    </section>
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ children }: { children: ReactNode }) {
  return <TabsPrimitive.List className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">{children}</TabsPrimitive.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
export const TabsContent = TabsPrimitive.Content;

/** A labelled live measurement. */
export function Stat({ label, value, color, hint }: { label: ReactNode; value: string; color?: string; hint?: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </div>
      <div className="font-mono text-[17px] tabular-nums text-ink">{value}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}
