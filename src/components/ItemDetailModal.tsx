import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type {
  MenuItem,
  MilkOption,
  SizeCode,
  SizeOption,
  SweetnessOption,
} from '../types';
import { SafeImage } from './SafeImage';

interface ItemDetailModalProps {
  item: MenuItem;
  defaultMilk: MilkOption;
  defaultSweetness: SweetnessOption;
  onClose: () => void;
  onAddToCart: (payload: {
    item: MenuItem;
    quantity: number;
    size: SizeOption;
    milk: MilkOption;
    sweetness: SweetnessOption;
    note: string;
    unitPrice: number;
  }) => void;
}

const SIZE_CODES: { code: SizeCode; label: string }[] = [
  { code: 'S', label: 'Small (S)' },
  { code: 'M', label: 'Medium (M)' },
  { code: 'L', label: 'Large (L)' },
  { code: 'XL', label: 'Extra Large (XL)' },
];

const MILKS: { label: MilkOption; delta: number }[] = [
  { label: 'Whole Dairy', delta: 0 },
  { label: 'Oat Milk', delta: 35 },
  { label: 'Almond Milk', delta: 35 },
  { label: 'Soy Milk', delta: 25 },
];

const SWEETNESS_OPTIONS: SweetnessOption[] = [
  'Regular',
  'Less Sugar',
  'Sugar Free',
];

const DRINK_CATEGORIES = new Set([
  'Shakes',
  'Hot Beverages',
  'Mocktails & Mojitos',
]);

export function ItemDetailModal({
  item,
  defaultMilk,
  defaultSweetness,
  onClose,
  onAddToCart,
}: ItemDetailModalProps) {
  const hasSizes = Boolean(item.sizePrices);
  const [sizeCode, setSizeCode] = useState<SizeCode>('M');
  const [milk, setMilk] = useState<MilkOption>(defaultMilk);
  const [sweetness, setSweetness] = useState<SweetnessOption>(defaultSweetness);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const isDrink = DRINK_CATEGORIES.has(item.category);
  const basePrice =
    hasSizes && item.sizePrices ? item.sizePrices[sizeCode] : item.price;
  const milkDelta = isDrink ? MILKS.find((m) => m.label === milk)?.delta || 0 : 0;
  const unitPrice = basePrice + milkDelta;
  const lineTotal = unitPrice * quantity;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div className="bg-white border border-zinc-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2">
        <div className="bg-zinc-100 aspect-[4/3] md:aspect-auto md:h-full">
          <SafeImage
            src={item.imageUrl}
            alt={item.name}
            fallbackLabel={item.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="p-6 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">
                  {item.category} · {item.prepTimeMins} min
                  {item.caffeineMg > 0 ? ` · ${item.caffeineMg} mg caffeine` : ''}
                </p>
                <h2
                  id="item-modal-title"
                  className="font-display text-2xl font-semibold text-zinc-950 leading-tight"
                >
                  {item.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close item details"
                className="p-2 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-2.5 text-sm text-zinc-600 leading-relaxed">
              {item.description}
            </p>

            {hasSizes && item.sizePrices && (
              <div className="mt-5">
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Cup Size
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SIZE_CODES.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSizeCode(s.code)}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        sizeCode === s.code
                          ? 'border-zinc-950 bg-zinc-950 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="font-mono tabular-nums">
                        ₹{item.sizePrices![s.code]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isDrink && (
              <div className="mt-4 space-y-4">
                {item.category !== 'Mocktails & Mojitos' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Milk Option
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MILKS.map((m) => (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => setMilk(m.label)}
                          className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            milk === m.label
                              ? 'border-amber-800 bg-amber-50 text-amber-950'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                          }`}
                        >
                          <span className="truncate">{m.label}</span>
                          <span className="font-mono tabular-nums ml-1">
                            {m.delta > 0 ? `+₹${m.delta}` : '₹0'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Sweetness Level
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-lg">
                    {SWEETNESS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSweetness(opt)}
                        className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          sweetness === opt
                            ? 'bg-white text-zinc-950 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-950'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label
                htmlFor="barista-note"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Kitchen / Barista Note (Optional)
              </label>
              <input
                id="barista-note"
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isDrink
                    ? 'Less ice, extra froth...'
                    : 'Extra spicy, less butter, cut in halves...'
                }
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 flex items-center justify-between gap-3">
            <div className="inline-flex items-center border border-zinc-200 rounded-lg">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="p-2.5 text-zinc-700 hover:text-zinc-950 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 text-sm font-mono font-medium tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                aria-label="Increase quantity"
                className="p-2.5 text-zinc-700 hover:text-zinc-950 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              disabled={!item.available}
              onClick={() =>
                onAddToCart({
                  item,
                  quantity,
                  size: hasSizes ? sizeCode : 'Regular',
                  milk: isDrink ? milk : 'Whole Dairy',
                  sweetness: isDrink ? sweetness : 'Regular',
                  note: note.trim(),
                  unitPrice,
                })
              }
              className="flex-1 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
            >
              Add to Bag · <span className="font-mono tabular-nums">₹{lineTotal}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
