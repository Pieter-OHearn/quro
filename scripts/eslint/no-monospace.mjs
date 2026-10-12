// V1 has one typeface and no monospace (docs/design-v1.md, section 3). Tailwind's
// `font-mono` utility and arbitrary monospace families would bring it back.
const MONOSPACE = /(?<![\w-])font-(?:mono(?![\w-])|\[[^\]]*mono)/i;

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow monospace font utilities; V1 uses one typeface.' },
    schema: [],
    messages: {
      monospace:
        'V1 has no monospace. Remove "{{utility}}"; use `font-numeric` for aligned numbers.',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return;
      const match = MONOSPACE.exec(value);
      if (match) {
        context.report({ node, messageId: 'monospace', data: { utility: match[0] } });
      }
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
