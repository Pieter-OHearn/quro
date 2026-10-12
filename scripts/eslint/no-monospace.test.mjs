import { describe, test } from 'bun:test';
import { RuleTester } from 'eslint';
import rule from './no-monospace.mjs';

RuleTester.describe = describe;
RuleTester.it = test;
const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});
tester.run('no-monospace', rule, {
  valid: [
    'const element = <span className="font-numeric font-medium text-cell" />;',
    'const classes = "font-semibold text-fg-muted";',
    'const classes = "text-fg-monochrome";',
    'const text = "monospace digits are not used";',
    'const key = "x-font-mono";',
  ],
  invalid: [
    'const element = <code className="font-mono text-xs" />;',
    'const classes = "md:font-mono";',
    'const classes = `rounded ${active} font-mono`;',
    'const classes = "font-[ui-monospace,monospace]";',
    'const classes = "font-[\'JetBrains_Mono\']";',
  ].map((code) => ({ code, errors: [{ messageId: 'monospace' }] })),
});
