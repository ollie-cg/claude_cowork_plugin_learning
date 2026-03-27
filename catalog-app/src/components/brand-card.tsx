import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BrandWithCount } from "@/types";

export function BrandCard({ brand }: { brand: BrandWithCount }) {
  return (
    <Link href={`/brands/${brand.id}`}>
      <div className="glass-card group rounded-xl p-5 transition-all duration-200 hover:glow-sm cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20">
              <span className="text-sm font-bold text-violet-400">
                {brand.name.charAt(0)}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-white transition-colors">
                {brand.name}
              </h3>
              {brand.country && (
                <p className="text-xs text-muted-foreground">{brand.country}</p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            {brand.product_count} {brand.product_count === 1 ? 'product' : 'products'}
          </Badge>
        </div>
        {brand.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{brand.description}</p>
        )}
        {brand.website && (
          <p className="text-xs text-muted-foreground/60 truncate">{brand.website}</p>
        )}
      </div>
    </Link>
  );
}
