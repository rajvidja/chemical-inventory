import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink-soft",
        teal: "bg-lavender-soft text-lavender-text hover:bg-lavender/40",
        tonal: "bg-sky-soft text-sky-text hover:bg-sky/25",
        secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-muted",
        ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger/90",
        "danger-ghost": "bg-danger-50 text-danger-700 hover:bg-danger/20",
        link: "text-blue hover:underline underline-offset-4 px-0 h-auto",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-[52px] px-6 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
