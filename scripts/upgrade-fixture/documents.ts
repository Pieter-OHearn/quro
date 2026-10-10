// The synthetic PDF attachments of the 0.7.0 upgrade fixture. Each document is a one-page PDF
// built byte for byte from the text below, so regenerating the fixture yields identical files.
// The text says what the file is; nothing in it resembles a real statement or person.
//
// edge-cases.sql records each document's key, size and SHA-256 in the rows that refer to it.
// generate.sh stops when those literals no longer match the bytes built here and prints the
// values to use instead.

export type FixtureDocument = {
  /** The random part of the 0.7.0 storage key, `users/<id>/.../<uuid>.pdf`; fixed here. */
  uuid: string;
  /** False for an object 0.7.0 already deleted (an expired import): the row stays, the file not. */
  stored: boolean;
  lines: string[];
};

// Byte offsets in the cross-reference table are ten digits wide.
const XREF_OFFSET_WIDTH = 10;

const NOTICE = 'Synthetic test document for the Quro 0.7.0 upgrade fixture. Not a real record.';

export const FIXTURE_DOCUMENTS: FixtureDocument[] = [
  {
    uuid: '00000000-0000-4000-8000-00000000f001',
    stored: true,
    lines: ['Payslip 2026-03 (demo user)', 'Gross 4200.00 EUR', NOTICE],
  },
  {
    uuid: '00000000-0000-4000-8000-00000000f002',
    stored: true,
    lines: ['Payslip 2026-02 (partner user)', 'Gross 3100.55 GBP', NOTICE],
  },
  {
    uuid: '00000000-0000-4000-8000-00000000f003',
    stored: true,
    lines: ['Annual pension statement 2025, uploaded by hand', NOTICE],
  },
  {
    uuid: '00000000-0000-4000-8000-00000000f004',
    stored: true,
    lines: ['Annual pension statement 2024, imported and committed', NOTICE],
  },
  {
    uuid: '00000000-0000-4000-8000-00000000f005',
    stored: true,
    lines: ['Annual pension statement 2026, import waiting for review', NOTICE],
  },
  {
    uuid: '00000000-0000-4000-8000-00000000f006',
    stored: false,
    lines: ['Annual pension statement 2023, import expired and deleted', NOTICE],
  },
];

function escapePdfText(text: string): string {
  if (!/^[\x20-\x7e]*$/.test(text)) throw new Error(`PDF text must be printable ASCII: ${text}`);
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

/** A minimal, valid single-page PDF 1.4 with one line of Helvetica text per entry. */
export function buildPdf(lines: readonly string[]): Uint8Array {
  const text = lines.map((line) => `(${escapePdfText(line)}) Tj`).join(' 0 -18 Td ');
  const content = `BT /F1 11 Tf 56 780 Td ${text} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(XREF_OFFSET_WIDTH, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export function sha256Hex(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}
