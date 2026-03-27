import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Product } from "@/types";

export function ProductTable({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No products yet. Add one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="text-muted-foreground font-medium">Name</TableHead>
          <TableHead className="text-muted-foreground font-medium">SKU</TableHead>
          <TableHead className="text-muted-foreground font-medium">Category</TableHead>
          <TableHead className="text-right text-muted-foreground font-medium">RSP</TableHead>
          <TableHead className="text-right text-muted-foreground font-medium">Case Size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} className="border-border/50 hover:bg-white/[0.02] transition-colors">
            <TableCell>
              <Link href={`/products/${product.id}`} className="font-medium text-foreground hover:text-violet-400 transition-colors">
                {product.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">{product.sku_code ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{product.category ?? "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {product.uk_rsp != null ? `£${product.uk_rsp.toFixed(2)}` : "—"}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">{product.case_size ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
