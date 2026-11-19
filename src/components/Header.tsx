import { ShoppingBag } from 'lucide-react';
import type { ActiveView } from '../types';

interface HeaderProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  cartCount: number;
  unreadNotifCount?: number;
  activeKitchenCount?: number;
  onOpenCart: () => void;
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'menu', label: 'Menu' },
  { id: 'tracker', label: 'Live Tracker' },
  { id: 'profile', label: 'Order History' },
  { id: 'kitchen', label: 'Kitchen Console' },
];

export function Header({
  activeView,
  onNavigate,
  cartCount,
  unreadNotifCount = 0,
  activeKitchenCount = 0,
  onOpenCart,
}: HeaderProps) {
  function getNavLabel(id: ActiveView, label: string): string {
    if (id === 'profile' && unreadNotifCount > 0) {
      return `${label} (${unreadNotifCount})`;
    }
    if (id === 'kitchen' && activeKitchenCount > 0) {
      return `${label} (${activeKitchenCount})`;
    }
    return label;
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('menu')}
          className="font-display text-lg sm:text-xl font-semibold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-800"
        >
          Suman Cold Coffee Depot
        </button>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer border-b-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-800 ${
                  isActive
                    ? 'text-zinc-950 border-amber-800'
                    : 'text-zinc-600 border-transparent hover:text-zinc-950'
                }`}
              >
                {getNavLabel(item.id, item.label)}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
          >
            <ShoppingBag className="w-4 h-4" strokeWidth={1.75} />
            <span className="tabular-nums">Bag ({cartCount})</span>
          </button>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center gap-4 px-4 py-2 border-t border-zinc-100 overflow-x-auto text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`py-1.5 whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                isActive
                  ? 'text-zinc-950 border-amber-800'
                  : 'text-zinc-600 border-transparent'
              }`}
            >
              {getNavLabel(item.id, item.label)}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
