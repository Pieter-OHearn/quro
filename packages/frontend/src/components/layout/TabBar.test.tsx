/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { TabBar } from './TabBar';

function renderTabBar(path: string, moreOpen = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <TabBar moreOpen={moreOpen} moreControls="app-sidebar" onMore={() => {}} />
    </MemoryRouter>,
  );
}

function linkFor(markup: string, label: string) {
  const link = new RegExp(`<a [^>]*>(?:(?!</a>).)*>${label}</span></a>`).exec(markup)?.[0];
  if (!link) throw new Error(`No tab link labelled ${label}`);
  return link;
}

describe('TabBar', () => {
  test('is a fixed main navigation shown only below 640px, above the safe area', () => {
    const markup = renderTabBar('/');
    expect(markup).toContain('<nav aria-label="Main"');
    expect(markup).toContain('fixed inset-x-0 bottom-0 z-40');
    expect(markup).toContain('border-t border-border-default bg-surface-nav');
    expect(markup).toContain('pb-[env(safe-area-inset-bottom)] sm:hidden');
  });

  test('labels the tabs as the pages name themselves, with More last', () => {
    const markup = renderTabBar('/');
    const labels = [...markup.matchAll(/<span class="whitespace-nowrap">([^<]+)<\/span>/g)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(['Dashboard', 'Savings', 'Investments', 'Budget', 'More']);
    expect(markup).not.toContain('>Home<');
    expect(linkFor(markup, 'Dashboard')).toContain('href="/"');
    expect(linkFor(markup, 'Savings')).toContain('href="/savings"');
    expect(linkFor(markup, 'Investments')).toContain('href="/investments"');
    expect(linkFor(markup, 'Budget')).toContain('href="/budget"');
  });

  test('every tab is 60px high and a fifth of the bar wide', () => {
    const markup = renderTabBar('/');
    expect(markup.match(/h-\[60px\] min-w-0 flex-1/g)).toHaveLength(5);
    expect(markup.match(/width="22" height="22"/g)).toHaveLength(5);
    expect(markup.match(/stroke-width="1.8"/g)).toHaveLength(5);
  });

  test('marks only the current page, with a brand-soft tint behind its icon', () => {
    const markup = renderTabBar('/savings');
    const savings = linkFor(markup, 'Savings');
    expect(savings).toContain('aria-current="page"');
    expect(savings).toContain('font-semibold text-brand-fg');
    expect(savings).toContain('bg-brand-soft');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(linkFor(markup, 'Dashboard')).not.toContain('aria-current');
  });

  test('More is a button that reports and controls the drawer', () => {
    expect(renderTabBar('/plan')).toContain(
      'type="button" aria-expanded="false" aria-controls="app-sidebar"',
    );
    expect(renderTabBar('/plan', true)).toContain('aria-expanded="true"');
    expect(renderTabBar('/plan')).not.toContain('aria-current');
  });
});
