"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ProductDetail } from "@/lib/db/catalog";
import { addToCart, type CartActionState } from "@/lib/actions/cart";

/**
 * Inline Add-to-cart control for branch users/managers — sits inside the
 * product detail drawer. Respects `min_order_qty` / `max_order_qty` from
 * the product. On success, shows a confirmation with a link to /cart.
 */
export function AddToCart({ product }: { product: ProductDetail }) {
  const [state, action] = useFormState<CartActionState, FormData>(
    addToCart,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  const [qty, setQty] = useState<string>(String(product.min_order_qty ?? 1));

  // Reset the local quantity state after a successful add so repeated use
  // doesn't pre-fill with the prior value.
  useEffect(() => {
    if (state && "success" in state) {
      setQty(String(product.min_order_qty ?? 1));
    }
  }, [state, product.min_order_qty]);

  return (
    <section className="space-y-2 rounded-lg bg-surface-elevated/40 p-4 ring-1 ring-inset ring-border">
      <p className="label-meta">Add to cart</p>
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="product_id" value={product.id} />
        <div className="w-[110px]">
          <Label htmlFor={`cart-qty-${product.id}`}>Quantity</Label>
          <Input
            id={`cart-qty-${product.id}`}
            name="quantity"
            type="number"
            min={product.min_order_qty}
            max={product.max_order_qty ?? undefined}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1.5 font-numeric"
            invalid={Boolean(fieldErrors.quantity)}
            required
          />
        </div>
        <SubmitBtn />
      </form>
      <p className="text-xs text-fg-subtle">
        Min {product.min_order_qty}
        {product.max_order_qty != null ? `, max ${product.max_order_qty}` : ""}
        {" · "}
        {product.available} available
      </p>
      {state && "error" in state && state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="h-3 w-3" /> Added —{" "}
          <Link href="/cart" className="underline">
            go to cart
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <ShoppingCart className="h-3.5 w-3.5" />
      Add
    </Button>
  );
}
