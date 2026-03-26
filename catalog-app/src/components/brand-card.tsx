import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BrandWithCount } from "@/types";

export function BrandCard({ brand }: { brand: BrandWithCount }) {
  return (
    <Link href={`/brands/${brand.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{brand.name}</CardTitle>
            <Badge variant="secondary">{brand.product_count} products</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {brand.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{brand.description}</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            {brand.country && <span>{brand.country}</span>}
            {brand.website && <span>{brand.website}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
