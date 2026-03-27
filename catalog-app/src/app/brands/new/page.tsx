"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewBrandPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      description: form.get("description") || null,
      website: form.get("website") || null,
      country: form.get("country") || null,
    };

    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const brand = await res.json();
      router.push(`/brands/${brand.id}`);
    } else {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-6">Add Brand</h1>

      <div className="glass-card rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="name" className="text-sm text-muted-foreground">Brand Name *</Label>
            <Input id="name" name="name" required className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="description" className="text-sm text-muted-foreground">Description</Label>
            <Textarea id="description" name="description" rows={3} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="website" className="text-sm text-muted-foreground">Website</Label>
            <Input id="website" name="website" type="url" placeholder="https://" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="country" className="text-sm text-muted-foreground">Country</Label>
            <Input id="country" name="country" className="mt-1.5" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
              {saving ? "Saving..." : "Create Brand"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
