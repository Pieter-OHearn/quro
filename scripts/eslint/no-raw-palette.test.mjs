import { describe, test } from 'bun:test';
import { RuleTester } from 'eslint';
import rule from './no-raw-palette.mjs';

RuleTester.describe = describe;
RuleTester.it = test;
const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});
tester.run('no-raw-palette', rule, {
  valid: [
    'const classes = "bg-brand text-fg hover:bg-brand-hover border-border-default";',
    'const classes = "bg-surface/80 ring-focus-ring text-success-fg";',
    'const color = "#6366f1";', // Persisted user-selected data colors are not utility chrome.
    'const element = <span className="text-sm border-2 bg-transparent" />;',
    'const text = "indigo is a color";',
  ],
  invalid: [
    'const element = <span className="text-slate-500" />;',
    'const classes = "hover:bg-indigo-600/80";',
    'const classes = "focus:ring-offset-rose-200";',
    'const classes = "border-t-emerald-100";',
    'const classes = "md:from-[#123456]";',
    'const classes = "bg-white/10";',
    'const classes = `text-rose-500 ${active}`;',
    'const classes = `bg-indigo-${shade}`;',
  ].map((code) => ({ code, errors: [{ messageId: 'rawPalette' }] })),
});
