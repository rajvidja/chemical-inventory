import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-14 w-full rounded-[14px] border border-line bg-surface px-4 text-[15px] font-medium text-ink placeholder:font-medium placeholder:text-faint outline-none transition focus:border-ink focus:ring-1 focus:ring-ink disabled:opacity-60 sm:h-12 sm:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-sm font-medium text-ink placeholder:text-faint outline-none transition focus:border-ink focus:ring-1 focus:ring-ink",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-semibold text-ink-2", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs font-semibold text-danger-700">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer grid size-5 shrink-0 place-items-center rounded-[6px] border-2 border-line-strong bg-surface transition data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=indeterminate]:border-ink data-[state=indeterminate]:bg-ink text-white",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-[linear-gradient(90deg,#ededef_0%,#f7f7f8_50%,#ededef_100%)] bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-1)]", className)} {...props} />;
}

export function SectionTitle({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-full bg-sunken p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold text-muted transition [&_svg]:size-4",
            size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-[var(--shadow-1)]" : "hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center animate-fade-in", className)}>
      <div className="mb-4 grid size-24 place-items-center rounded-full bg-lavender-soft text-lavender-text [&_svg]:size-9">{icon}</div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
