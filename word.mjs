import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
} from './vendor/docx.mjs';

const FIELDS = ['titleNumber', 'propertyDescription', 'proprietorship', 'charges', 'restrictions'];

export function createWordDocument(rows) {
  const widths = [1350, 4140, 2750, 3500, 3700];
  const headings = [
    'Title number',
    'Land / property description',
    'Legal proprietorship',
    'Charges',
    'Restrictions',
  ];
  const border = { style: BorderStyle.SINGLE, size: 5, color: 'BFCBC5' };

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headings.map((heading, index) => makeWordCell(heading, widths[index], {
      bold: true,
      color: 'FFFFFF',
      fill: '174A3B',
      fontSize: 17,
      border,
    })),
  });

  const bodyRows = rows.map((summary, rowIndex) => new TableRow({
    cantSplit: true,
    children: FIELDS.map((field, columnIndex) => makeWordCell(summary[field], widths[columnIndex], {
      bold: columnIndex === 0,
      color: columnIndex === 0 ? '174A3B' : '1F312B',
      fill: rowIndex % 2 ? 'F3F7F4' : 'FFFFFF',
      fontSize: 17,
      border,
    })),
  }));

  return new Document({
    creator: 'TitleBrief',
    title: 'Title Register Summary',
    description: 'A concise summary compiled from supplied HM Land Registry official copies.',
    styles: {
      default: {
        document: {
          run: { font: 'Aptos', size: 18, color: '1F312B' },
          paragraph: { spacing: { after: 0, line: 240 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 700, bottom: 720, left: 700, header: 360, footer: 360 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'TitleBrief · Browser-generated summary', size: 14, color: '6D7D77' })],
          })],
        }),
      },
      children: [
        new Paragraph({
          spacing: { after: 90 },
          children: [new TextRun({ text: 'Title Register Summary', bold: true, size: 32, color: '143F34', font: 'Aptos Display' })],
        }),
        new Paragraph({
          spacing: { after: 260 },
          children: [new TextRun({
            text: 'Compiled from the HM Land Registry official copies supplied. This summary is for convenience only; the official registers and title plans remain authoritative.',
            italics: true,
            size: 16,
            color: '64736D',
          })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: widths,
          layout: TableLayoutType.FIXED,
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows: [headerRow, ...bodyRows],
        }),
      ],
    }],
  });
}

function makeWordCell(text, width, options) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlignTable.TOP,
    margins: { top: 115, right: 125, bottom: 115, left: 125 },
    shading: { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' },
    borders: { top: options.border, bottom: options.border, left: options.border, right: options.border },
    children: [new Paragraph({
      spacing: { after: 0, line: 235 },
      children: [new TextRun({
        text: String(text || 'none'),
        bold: options.bold,
        color: options.color,
        size: options.fontSize,
        font: 'Aptos',
      })],
    })],
  });
}
