import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteMetadata } from '../../services/api';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const SETTLE_DELAY_MS = 130;

interface RoutePickerWheelProps {
  routes: RouteMetadata[];
  accentColor: string;
  selectedRouteShortName?: string | null;
  onSelect: (route: RouteMetadata) => void;
  onClose: () => void;
}

// An iOS-style scroll-snap picker wheel: scroll (or tap an item) to bring a
// route to the center band, which auto-selects once scrolling settles.
export default function RoutePickerWheel({
  routes,
  accentColor,
  selectedRouteShortName,
  onSelect,
  onClose
}: RoutePickerWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [centeredIndex, setCenteredIndex] = useState(0);
  const [filterText, setFilterText] = useState('');

  const filteredRoutes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.route_short_name.toLowerCase().includes(q) ||
        r.route_long_name.toLowerCase().includes(q)
    );
  }, [routes, filterText]);

  useEffect(() => {
    const initialIndex = selectedRouteShortName
      ? Math.max(0, filteredRoutes.findIndex((r) => r.route_short_name === selectedRouteShortName))
      : 0;
    setCenteredIndex(initialIndex);
    scrollRef.current?.scrollTo({ top: initialIndex * ITEM_HEIGHT, behavior: 'auto' });
    // Only run on mount - re-scrolling on every prop change would fight the user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the filter changes the visible set, snap back to the top rather
  // than leaving the center band pointed at a now-different (or gone) item.
  useEffect(() => {
    setCenteredIndex(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [filterText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || filteredRoutes.length === 0) return;

    const index = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(filteredRoutes.length - 1, index));
    setCenteredIndex(clamped);

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (filteredRoutes[clamped]) onSelect(filteredRoutes[clamped]);
    }, SETTLE_DELAY_MS);
  }, [filteredRoutes, onSelect]);

  const handleItemClick = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const paddingY = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

  return (
    <div className="pointer-events-auto w-64 overflow-hidden rounded-2xl border border-subtle bg-surface-elevated/95 shadow-glass backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="SELECT ROUTE"
          aria-label="Filter routes"
          className="w-full bg-transparent font-display text-[0.7rem] font-bold tracking-wider text-secondary placeholder:text-secondary/60 outline-none"
        />
        <button
          onClick={onClose}
          aria-label="Close route picker"
          className="shrink-0 text-secondary transition-colors hover:text-accent-cyan"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative" style={{ height: WHEEL_HEIGHT }}>
        {/* Center selection band */}
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 border-y"
          style={{
            top: paddingY,
            height: ITEM_HEIGHT,
            borderColor: `${accentColor}55`,
            background: `${accentColor}14`
          }}
        />

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto scroll-smooth"
          style={{
            scrollSnapType: 'y mandatory',
            paddingTop: paddingY,
            paddingBottom: paddingY,
            maskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)'
          }}
        >
          {filteredRoutes.length === 0 ? (
            <div
              className="flex items-center justify-center text-center text-xs font-semibold text-secondary/70"
              style={{ height: WHEEL_HEIGHT - paddingY * 2 }}
            >
              No matching routes
            </div>
          ) : (
            filteredRoutes.map((route, index) => {
              const distance = Math.abs(index - centeredIndex);
              const opacity = Math.max(0.18, 1 - distance * 0.32);
              const scale = Math.max(0.75, 1 - distance * 0.1);

              return (
                <div
                  key={`${route.route_id}-${index}`}
                  onClick={() => handleItemClick(index)}
                  className="flex cursor-pointer items-center justify-center px-4 text-center transition-transform"
                  style={{
                    height: ITEM_HEIGHT,
                    scrollSnapAlign: 'center',
                    opacity,
                    transform: `scale(${scale})`
                  }}
                >
                  <span
                    className="truncate font-display text-sm font-semibold"
                    style={{ color: distance === 0 ? accentColor : 'var(--color-secondary)' }}
                    title={route.route_long_name}
                  >
                    {route.route_short_name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
