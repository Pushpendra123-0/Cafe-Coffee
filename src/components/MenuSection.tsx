import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { CartItem, MenuCategory, MenuItem, SizeCode, SizeOption } from '../types';
import { SafeImage } from './SafeImage';

interface MenuSectionProps {
  category: MenuCategory;
  sectionImage: string;
  items: MenuItem[];
  cart: CartItem[];
  onQuickAdd: (item: MenuItem, size: SizeOption) => void;
  onUpdateCartQty: (cartKey: string, delta: number) => void;
  onCustomize: (item: MenuItem) => void;
}

const SIZE_CODES: SizeCode[] = ['S', 'M', 'L', 'XL'];

function MenuItemRow({
  item,
  cart,
  onQuickAdd,
  onUpdateCartQty,
  onCustomize,
}: {
  item: MenuItem;
  cart: CartItem[];
  onQuickAdd: (item: MenuItem, size: SizeOption) => void;
  onUpdateCartQty: (cartKey: string, delta: number) => void;
  onCustomize: (item: MenuItem) => void;
}) {
  const [selectedSize, setSelectedSize] = useState<SizeCode>('S');
  const hasSizes = Boolean(item.sizePrices);
  const activeSize: SizeOption = hasSizes ? selectedSize : 'Regular';
  const activePrice =
    hasSizes && item.sizePrices ? item.sizePrices[selectedSize] : item.price;

  const matchingCartItem = cart.find(
    (c) =>
      c.itemId === item.id &&
      c.size === activeSize &&
      c.milk === 'Whole Dairy' &&
      c.sweetness === 'Regular' &&
      !c.note
  );

  return (
    <div className="py-3.5 px-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 transition-colors">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onCustomize(item)}
          className="text-left text-sm sm:text-base font-medium text-zinc-950 hover:text-amber-900 transition-colors cursor-pointer truncate focus-visible:outline-2 focus-visible:outline-amber-800"
        >
          {item.name}
        </button>
        {!item.available && (
          <span className="text-xs font-medium text-red-700 shrink-0">
            Sold Out
          </span>
        )}
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        {hasSizes && item.sizePrices ? (
          <div
            role="group"
            aria-label={`Size for ${item.name}`}
            className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-100 rounded-lg"
          >
            {SIZE_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedSize(code)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  selectedSize === code
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        ) : null}

        <span className="font-mono text-sm sm:text-base font-medium text-zinc-950 tabular-nums w-14 text-right">
          ₹{activePrice}
        </span>

        {matchingCartItem ? (
          <div className="inline-flex items-center border border-zinc-950 bg-zinc-950 text-white rounded-lg h-9">
            <button
              type="button"
              onClick={() => onUpdateCartQty(matchingCartItem.cartKey, -1)}
              aria-label={`Remove one ${item.name}`}
              className="px-2.5 h-full flex items-center justify-center hover:bg-zinc-800 rounded-l-lg cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono font-medium tabular-nums">
              {matchingCartItem.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateCartQty(matchingCartItem.cartKey, 1)}
              aria-label={`Add one more ${item.name}`}
              className="px-2.5 h-full flex items-center justify-center hover:bg-zinc-800 rounded-r-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!item.available}
            onClick={() => onQuickAdd(item, activeSize)}
            className="inline-flex items-center justify-center gap-1 px-3.5 h-9 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer min-w-[74px]"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>Add</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function MenuSection({
  category,
  sectionImage,
  items,
  cart,
  onQuickAdd,
  onUpdateCartQty,
  onCustomize,
}: MenuSectionProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label={category}
      className="bg-white border border-zinc-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12"
    >
      <div className="lg:col-span-4 bg-zinc-50 border-b lg:border-b-0 lg:border-r border-zinc-200 p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-semibold text-zinc-950">
            {category}
          </h3>
          <span className="font-mono text-xs text-zinc-500 tabular-nums">
            {items.length} items
          </span>
        </div>

        <div className="aspect-[4/3] w-full rounded-lg overflow-hidden bg-zinc-200">
          <SafeImage
            src={sectionImage}
            alt={category}
            fallbackLabel={category}
            className="w-full h-full object-cover"
          />
        </div>

        {items.some((i) => i.sizePrices) && (
          <p className="text-xs text-zinc-500">
            Select S, M, L, or XL beside any drink to see size pricing and add to bag.
          </p>
        )}
      </div>

      <div className="lg:col-span-8 divide-y divide-zinc-100">
        {items.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            cart={cart}
            onQuickAdd={onQuickAdd}
            onUpdateCartQty={onUpdateCartQty}
            onCustomize={onCustomize}
          />
        ))}
      </div>
    </section>
  );
}
