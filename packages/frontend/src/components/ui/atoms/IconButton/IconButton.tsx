import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  danger: 'text-slate-200 hover:bg-rose-50 hover:text-rose-400',
  ghost: 'text-slate-300 hover:bg-slate-100 hover:text-slate-500',
  subtle: 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
} as const;

const SIZE_CLASSES = {
  sm: 'h-6 w-6 rounded-md',
  md: 'h-8 w-8 rounded-lg',
  lg: 'h-11 w-11 rounded-xl',
} as const;

const ICON_SIZES = {
  sm: 12,
  md: 14,
  lg: 18,
} as const;

type CommonIconButtonProps = {
  icon: LucideIcon;
  label: string;
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  iconClassName?: string;
};

type IconButtonAsButtonProps = CommonIconButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
    href?: never;
  };

type IconButtonAsAnchorProps = CommonIconButtonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'children'> & {
    href: string;
  };

export type IconButtonProps = IconButtonAsAnchorProps | IconButtonAsButtonProps;

function isAnchorProps(props: IconButtonProps): props is IconButtonAsAnchorProps {
  return 'href' in props;
}

function IconButtonContent({
  icon: Icon,
  iconClassName,
  size,
}: Pick<CommonIconButtonProps, 'icon' | 'iconClassName' | 'size'>) {
  return <Icon size={ICON_SIZES[size ?? 'md']} className={iconClassName} />;
}

function getSharedClassName({
  className,
  size = 'md',
  variant = 'ghost',
}: Pick<CommonIconButtonProps, 'className' | 'size' | 'variant'>) {
  return cn(
    'inline-flex flex-shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    className,
  );
}

export function IconButton(props: IconButtonProps) {
  if (isAnchorProps(props)) {
    const {
      className,
      href,
      icon,
      iconClassName,
      label,
      size = 'md',
      title,
      variant = 'ghost',
      ...anchorProps
    } = props;

    return (
      <a
        href={href}
        aria-label={label}
        title={title ?? label}
        className={getSharedClassName({ className, size, variant })}
        {...anchorProps}
      >
        <IconButtonContent icon={icon} iconClassName={iconClassName} size={size} />
      </a>
    );
  }

  const {
    className,
    disabled,
    icon,
    iconClassName,
    label,
    size = 'md',
    title,
    type = 'button',
    variant = 'ghost',
    ...buttonProps
  } = props;

  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={getSharedClassName({ className, size, variant })}
      {...buttonProps}
    >
      <IconButtonContent icon={icon} iconClassName={iconClassName} size={size} />
    </button>
  );
}
