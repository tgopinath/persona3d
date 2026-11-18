"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { GenerationStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-paper text-void hover:bg-white",
  secondary: "bg-graphite text-paper hover:bg-[#232636]",
  ghost: "text-mist hover:text-paper hover:bg-graphite",
  danger: "bg-bad/15 text-bad hover:bg-bad/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm";
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${s} ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size = "md", children, className = "" }: { href: string; variant?: Variant; size?: "sm" | "md" | "lg"; children: ReactNode; className?: string }) {
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm";
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors ${s} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const STATUS: Record<GenerationStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-graphite text-mist" },
  queued: { label: "Queued", cls: "bg-volt/15 text-volt" },
  processing: { label: "Generating", cls: "bg-violet/15 text-violet" },
  completed: { label: "Ready", cls: "bg-ok/12 text-ok" },
  failed: { label: "Failed", cls: "bg-bad/15 text-bad" },
  cancelled: { label: "Cancelled", cls: "bg-graphite text-mist" },
};
export function StatusBadge({ status }: { status: GenerationStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "violet" | "volt" | "warn" }) {
  const t = { neutral: "bg-graphite text-mist", violet: "bg-violet/15 text-violet", volt: "bg-volt/15 text-volt", warn: "bg-warn/15 text-warn" }[tone];
  return <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-void/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3 text-[13px] transition-colors ${value === o.value ? "bg-graphite text-paper" : "text-mist hover:text-paper"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-2 ${disabled ? "opacity-45" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[13px] text-mist">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-violet" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-paper transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block py-1.5">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-mist">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full" />
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-mist" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? "Loading"}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 p-8">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="max-w-prose text-mist">{body}</p>
      {action}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">
      <span>{children}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal
            aria-label={title}
            className="panel w-full max-w-md p-6"
            initial={{ y: 12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold">{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-mist">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-11 w-full rounded-xl bg-void/70 px-3.5 text-sm text-paper placeholder:text-mist/60 outline-none ring-1 ring-line focus:ring-volt";
