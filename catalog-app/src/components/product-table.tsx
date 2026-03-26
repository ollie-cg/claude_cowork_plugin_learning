import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Product } from "@/types";

export function ProductTable({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className="text-muted-foreground py-4">No products yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">RSP</TableHead>
          <TableHead className="text-right">Case Size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell>
              <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                {product.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{product.sku_code ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{product.category ?? "—"}</TableCell>
            <TableCell className="text-right">
              {product.uk_rsp != null ? `£${product.uk_rsp.toFixed(2)}` : "—"}
            </TableCell>
            <TableCell className="text-right">{product.case_size ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
