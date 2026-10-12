import { NavLink } from 'react-router';
import { Menu, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, TAB_BAR_PATHS } from './navItems';

// The bar is 61px high above the safe area (60px tabs and a 1px top border); `Layout` pads the
// page by the same amount so no content sits behind it. Each tab fills a fifth of the bar and is
// 60px high, so every target clears 44px. The current page is a `brand-soft` tint behind the icon
// with `brand-fg` text, like the sidebar's active item; press feedback tints the same spot. The
// focus outline sits inside the tab because the bar runs edge to edge.
const TAB_CLASSES =
  'group flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-[14px] font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring';
const REST_CLASSES = 'text-fg-subtle hover:text-fg active:text-fg';
const ACTIVE_CLASSES = 'font-semibold text-brand-fg';
const WELL_CLASSES =
  'flex h-7 w-12 items-center justify-center rounded-md transition-colors duration-fast';
const REST_WELL_CLASSES = 'group-hover:bg-surface-muted group-active:bg-surface-muted';
const ACTIVE_WELL_CLASSES = 'bg-brand-soft';
const ICON_SIZE_PX = 22;

const tabs = TAB_BAR_PATHS.map((path) => {
  const item = navItems.find((navItem) => navItem.path === path);
  if (!item) throw new Error(`No navigation item for tab path ${path}`);
  return item;
});

type TabContentProps = { icon: LucideIcon; label: string; active: boolean };

function TabContent({ icon: Icon, label, active }: Readonly<TabContentProps>) {
  return (
    <>
      <span className={cn(WELL_CLASSES, active ? ACTIVE_WELL_CLASSES : REST_WELL_CLASSES)}>
        <Icon size={ICON_SIZE_PX} strokeWidth={1.8} aria-hidden="true" />
      </span>
      {/* Labels never truncate, so a page is never abbreviated. On a 320px screen "Investments" is
          a few pixels wider than its tab and overhangs into the space its neighbours leave. */}
      <span className="whitespace-nowrap">{label}</span>
    </>
  );
}

type TabBarProps = {
  moreOpen: boolean;
  moreControls: string;
  onMore: () => void;
};

// Phone navigation below 640px: four pages and "More", which opens the navigation drawer with
// every destination.
export function TabBar({ moreOpen, moreControls, onMore }: Readonly<TabBarProps>) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-nav pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="flex">
        {tabs.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => cn(TAB_CLASSES, isActive ? ACTIVE_CLASSES : REST_CLASSES)}
          >
            {({ isActive }) => <TabContent icon={icon} label={label} active={isActive} />}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreControls}
          onClick={onMore}
          className={cn(TAB_CLASSES, REST_CLASSES)}
        >
          <TabContent icon={Menu} label="More" active={false} />
        </button>
      </div>
    </nav>
  );
}
