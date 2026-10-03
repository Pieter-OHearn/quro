const PALETTES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES =
  '(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|divide|placeholder|fill|stroke|shadow|accent|caret|decoration|from|via|to)';
const RAW_COLOR = new RegExp(
  `\\b${COLOR_UTILITIES}-(?:(?:${PALETTES})-(?:\\d{2,3}\\b|$)|(?:white|black)\\b|\\[#[\\da-fA-F]{3,8}\\])`,
);

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use semantic theme tokens instead of raw Tailwind colors.' },
    schema: [],
    messages: {
      rawPalette: 'Use a semantic color token from theme.css instead of "{{color}}".',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return;
      const match = RAW_COLOR.exec(value);
      if (match) {
        context.report({ node, messageId: 'rawPalette', data: { color: match[0] } });
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
