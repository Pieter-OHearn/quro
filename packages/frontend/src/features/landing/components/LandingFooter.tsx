import { QuroLogo } from '@/components/ui';
import { cn } from '@/lib/utils';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_LINK_CLASS_NAME } from './landingStyles';

export function LandingFooter() {
  return (
    <footer className="border-t border-border-default py-6">
      <div
        className={cn(
          LANDING_CONTAINER_CLASS_NAME,
          'flex flex-col items-center justify-between gap-3 text-caption text-fg-muted sm:flex-row',
        )}
      >
        <div className="flex items-center gap-2">
          <QuroLogo size={20} />
          <span className="text-label text-fg">Quro</span>
          <span>· Personal finance</span>
        </div>
        <div className="flex items-center gap-6">
          {['Privacy', 'Terms'].map((label) => (
            <a
              key={label}
              href="#"
              className={cn(
                LANDING_LINK_CLASS_NAME,
                'max-sm:inline-flex max-sm:min-h-11 max-sm:items-center',
              )}
            >
              {label}
            </a>
          ))}
        </div>
        <p>© 2026 Quro. All rights reserved.</p>
      </div>
    </footer>
  );
}
