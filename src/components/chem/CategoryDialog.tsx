import { useState } from "react";
import { toast } from "sonner";
import type { CategoryNode } from "@shared/types";
import { api, useInventoryMutation, useMeta } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "./bits";

const COLORS = ["#167D83", "#173B57", "#23865B", "#D99A36", "#D94C4C", "#7A5AB8", "#2F6FB3", "#B3562F", "#5E7D2E", "#788795"];

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  parentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category?: CategoryNode;
  parentId?: number | null;
}) {
  const { data: meta } = useMeta();
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [parent, setParent] = useState<number | null>(category ? category.parentId : (parentId ?? null));
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(category?.icon ?? "package");
  const save = useInventoryMutation((body: unknown) =>
    category ? api(`/categories/${category.id}`, { method: "PATCH", json: body }) : api("/categories", { method: "POST", json: body }),
  );

  const submit = () => {
    if (!name.trim()) return toast.error("Category name is required");
    save.mutate(
      { name: name.trim(), description: description.trim() || null, parentId: parent, color, icon },
      {
        onSuccess: () => {
          toast.success(category ? "Category updated" : `Category “${name.trim()}” created`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Edit category" : "New category"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {category ? "Save" : "Create category"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fluorinating agents" autoFocus />
        </Field>
        {!category?.children.length && (
          <Field label="Parent category" hint="Leave empty to create a top-level category">
            <select
              value={parent ?? ""}
              onChange={(e) => setParent(e.target.value ? Number(e.target.value) : null)}
              className="h-10 w-full rounded-[14px] border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
            >
              <option value="">None (top level)</option>
              {meta?.categories
                .filter((c) => c.id !== category?.id && c.slug !== "unclassified")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        {!parent && (
          <>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Colour</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn("size-8 rounded-full ring-offset-2 transition", color === c && "ring-2 ring-ink")}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Icon</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_ICON_NAMES.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={cn("grid size-11 place-items-center rounded-full transition", icon === i ? "bg-ink text-white" : "bg-sunken hover:bg-line")}
                    
                    aria-label={i}
                  >
                    <CategoryIcon icon={i} className="size-[18px]" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
