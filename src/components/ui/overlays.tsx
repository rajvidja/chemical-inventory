import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import * as React from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Responsive modal: centred dialog on desktop, full-width bottom sheet on mobile.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  if (!desktop) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/45" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[36px] bg-surface shadow-[var(--shadow-4)] outline-none">
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
            <div className="px-6 pb-2 pt-4">
              <Drawer.Title className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</Drawer.Title>
              {description && <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description>}
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-4", className)}>{children}</div>
            {footer && <div className="flex gap-2 border-t border-line px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] [&>*]:flex-1 [&>*]:h-[52px]">{footer}</div>}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/45 animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] bg-surface shadow-[var(--shadow-4)] outline-none animate-slide-up",
            wide ? "max-w-3xl" : "max-w-[520px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-7 pb-2 pt-6">
            <div>
              <DialogPrimitive.Title className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-7 pb-6", className)}>{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-7 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Side panel on desktop, bottom sheet on mobile. Used for filters. */
export function SidePanel({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/45" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface outline-none",
            desktop ? "inset-y-3 right-3 w-[420px] rounded-[28px] shadow-[var(--shadow-4)]" : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[36px]",
          )}
        >
          {!desktop && <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line-strong" />}
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <Drawer.Title className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</Drawer.Title>
            <Drawer.Close asChild>
              <Button variant="secondary" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </Drawer.Close>
          </div>
          <Drawer.Description className="sr-only">{title}</Drawer.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="flex gap-2 border-t border-line px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

const ConfirmContext = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialogPrimitive.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/45 animate-fade-in" />
          <AlertDialogPrimitive.Content className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-[28px] bg-surface p-6 shadow-[var(--shadow-4)] animate-slide-up md:inset-x-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2">
            <AlertDialogPrimitive.Title className="text-[22px] font-bold tracking-[-0.01em] text-ink">{state?.title}</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description asChild>
              <div className="mt-2 text-sm leading-relaxed text-ink-2">{state?.description}</div>
            </AlertDialogPrimitive.Description>
            <div className="mt-5 flex justify-end gap-2 [&>*]:flex-1 md:[&>*]:flex-none">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button variant={state?.destructive ? "danger" : "primary"} onClick={() => close(true)}>
                  {state?.confirmLabel ?? "Confirm"}
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => React.useContext(ConfirmContext);

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn(
          "z-50 min-w-52 rounded-[20px] border border-line bg-surface p-1.5 shadow-[var(--shadow-2)] animate-fade-in",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-[14px] px-3 text-sm font-semibold text-ink outline-none data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-muted",
        destructive && "text-danger-700 [&_svg]:text-danger-700 data-[highlighted]:bg-danger-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}
