import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// One sidebar row: 32px high (44px on phones), 16px icon, `cell` text. The active page is a `brand-soft` tint
// with `brand-fg` text, never a fill, bar or pill. Keyboard focus is the 2px outline at a
// 1px offset every control uses.
const ITEM_CLASSES =
  'group relative flex h-8 max-sm:h-11 w-full items-center gap-2 rounded-md px-2 text-cell transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring';
const REST_CLASSES =
  'text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-surface-muted active:text-fg';
const ACTIVE_CLASSES = 'bg-brand-soft font-semibold text-brand-fg';
const ICON_SIZE_PX = 16;
// The gap between an item's right edge and its tooltip.
const TOOLTIP_OFFSET_PX = 8;

type SidebarItemProps = {
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
};

type TooltipAnchor = {
  /** Places the tooltip beside the item that was hovered or focused. */
  onAnchor: (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;
  style: CSSProperties | undefined;
};

function itemClassName(active: boolean, collapsed: boolean) {
  return cn(ITEM_CLASSES, active ? ACTIVE_CLASSES : REST_CLASSES, collapsed && 'justify-center');
}

/**
 * The collapsed nav scrolls on a short window, and a scroll container clips what sticks out of
 * it, so the label tooltip is fixed to the viewport and placed beside its item when the pointer
 * or keyboard focus reaches the item.
 */
function useTooltipAnchor(collapsed: boolean): TooltipAnchor {
  const [style, setStyle] = useState<CSSProperties>();
  return {
    onAnchor: (event) => {
      if (!collapsed) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setStyle({ top: rect.top + rect.height / 2, left: rect.right + TOOLTIP_OFFSET_PX });
    },
    style,
  };
}

// The collapsed sidebar shows only the icon; the label is a tooltip that also names the link.
function ItemContent({
  icon: Icon,
  label,
  collapsed,
  tooltipStyle,
}: Readonly<SidebarItemProps & { tooltipStyle: CSSProperties | undefined }>) {
  return (
    <>
      <Icon size={ICON_SIZE_PX} className="flex-shrink-0" aria-hidden="true" />
      {collapsed ? (
        <span
          style={tooltipStyle}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-inverse px-2 py-1 text-caption font-normal text-fg-on-inverse opacity-0 shadow-popover transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {label}
        </span>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </>
  );
}

type SidebarLinkProps = SidebarItemProps & {
  to: string;
  onNavigate: () => void;
};

export function SidebarLink({ to, onNavigate, ...item }: Readonly<SidebarLinkProps>) {
  const tooltip = useTooltipAnchor(item.collapsed);
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      onMouseEnter={tooltip.onAnchor}
      onFocus={tooltip.onAnchor}
      className={({ isActive }) => itemClassName(isActive, item.collapsed)}
    >
      <ItemContent {...item} tooltipStyle={tooltip.style} />
    </NavLink>
  );
}

type SidebarButtonProps = SidebarItemProps & {
  onClick: () => void;
};

export function SidebarButton({ onClick, ...item }: Readonly<SidebarButtonProps>) {
  const tooltip = useTooltipAnchor(item.collapsed);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={tooltip.onAnchor}
      onFocus={tooltip.onAnchor}
      className={cn(itemClassName(false, item.collapsed), 'font-normal')}
    >
      <ItemContent {...item} tooltipStyle={tooltip.style} />
    </button>
  );
}
