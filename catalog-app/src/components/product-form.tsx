"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Product } from "@/types";

interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea";
}

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Identity",
    fields: [
      { name: "name", label: "Product Name" },
      { name: "sku_code", label: "SKU Code" },
      { name: "ean", label: "EAN" },
      { name: "case_ean", label: "Case EAN" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category" },
      { name: "category_detail", label: "Sub-category" },
    ],
  },
  {
    title: "Commercial",
    fields: [
      { name: "uk_rsp", label: "UK RSP (£)", type: "number" },
      { name: "wholesale_case_cost", label: "Wholesale Case Cost (£)", type: "number" },
      { name: "case_size", label: "Case Size", type: "number" },
      { name: "vat_percent", label: "VAT %", type: "number" },
    ],
  },
  {
    title: "Physical (Unit)",
    fields: [
      { name: "unit_depth_mm", label: "Depth (mm)", type: "number" },
      { name: "unit_width_mm", label: "Width (mm)", type: "number" },
      { name: "unit_height_mm", label: "Height (mm)", type: "number" },
      { name: "unit_net_weight_g", label: "Net Weight (g)", type: "number" },
      { name: "unit_gross_weight_g", label: "Gross Weight (g)", type: "number" },
    ],
  },
  {
    title: "Case & Pallet",
    fields: [
      { name: "case_depth_mm", label: "Case Depth (mm)", type: "number" },
      { name: "case_width_mm", label: "Case Width (mm)", type: "number" },
      { name: "case_height_mm", label: "Case Height (mm)", type: "number" },
      { name: "pallet_qty", label: "Pallet Qty", type: "number" },
      { name: "layer_qty", label: "Layer Qty", type: "number" },
    ],
  },
  {
    title: "Nutritional (per 100g/ml)",
    fields: [
      { name: "energy_kj_per_100", label: "Energy (kJ)" },
      { name: "energy_kcal_per_100", label: "Energy (kcal)" },
      { name: "fat_per_100", label: "Fat (g)" },
      { name: "saturates_per_100", label: "Saturates (g)" },
      { name: "carbs_per_100", label: "Carbs (g)" },
      { name: "sugars_per_100", label: "Sugars (g)" },
      { name: "fibre_per_100", label: "Fibre (g)" },
      { name: "protein_per_100", label: "Protein (g)" },
      { name: "salt_per_100", label: "Salt (g)" },
    ],
  },
  {
    title: "Nutritional (per serving)",
    fields: [
      { name: "serving_type", label: "Serving Type (e.g. per 60ml)" },
      { name: "energy_kj_per_serving", label: "Energy (kJ)" },
      { name: "energy_kcal_per_serving", label: "Energy (kcal)" },
      { name: "fat_per_serving", label: "Fat (g)" },
      { name: "saturates_per_serving", label: "Saturates (g)" },
      { name: "carbs_per_serving", label: "Carbs (g)" },
      { name: "sugars_per_serving", label: "Sugars (g)" },
      { name: "fibre_per_serving", label: "Fibre (g)" },
      { name: "protein_per_serving", label: "Protein (g)" },
      { name: "salt_per_serving", label: "Salt (g)" },
    ],
  },
  {
    title: "Other",
    fields: [
      { name: "ingredients", label: "Ingredients", type: "textarea" },
      { name: "allergens", label: "Allergens", type: "textarea" },
      { name: "country_of_origin", label: "Country of Origin" },
      { name: "manufacturer_name", label: "Manufacturer Name" },
      { name: "manufacturer_address", label: "Manufacturer Address", type: "textarea" },
      { name: "shelf_life_days", label: "Shelf Life (days)", type: "number" },
    ],
  },
];

interface ProductFormProps {
  product?: Product;
  brandId: number;
}

export function ProductForm({ product, brandId }: ProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = !!product;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { brand_id: brandId };

    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const val = form.get(field.name) as string;
        if (field.type === "number") {
          body[field.name] = val ? Number(val) : null;
        } else {
          body[field.name] = val || null;
        }
      }
    }

    const url = isEdit ? `/api/products/${product.id}` : "/api/products";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const saved = await res.json();
      router.push(`/products/${saved.id}`);
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {SECTIONS.map((section) => (
        <Collapsible key={section.title} defaultOpen={section.title === "Identity"}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 font-medium hover:bg-muted/50">
            {section.title}
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => {
                const fieldValue = product?.[field.name as keyof Product];
                const defaultValue = fieldValue != null ? String(fieldValue) : "";

                return (
                  <div key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                    <Label htmlFor={field.name}>{field.label}</Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        id={field.name}
                        name={field.name}
                        rows={3}
                        defaultValue={defaultValue}
                      />
                    ) : (
                      <Input
                        id={field.name}
                        name={field.name}
                        type={field.type === "number" ? "number" : "text"}
                        step={field.type === "number" ? "any" : undefined}
                        defaultValue={defaultValue}
                        required={field.name === "name"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
