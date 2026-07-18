import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.mjs';
import { Document, Paragraph, Table, TableCell, TableRow, TextRun, Packer } from './node_modules/docx/dist/index.mjs';

const pdfInput = document.getElementById('pdfInput');
const statusEl = document.getElementById('status');
const tableContainer = document.getElementById('summaryTableContainer');
const exportWordBtn = document.getElementById('exportWordBtn');

let parsedSummary = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.mjs';

pdfInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  statusEl.textContent = 'Extracting text from PDF...';
  exportWordBtn.disabled = true;

  try {
    const text = await extractTextFromPdf(file);
    parsedSummary = parseLandRegistryText(text);
    renderSummary(parsedSummary);
    statusEl.textContent = `Processed ${file.name}`;
    exportWordBtn.disabled = false;
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Unable to extract text from this PDF. Please try another file.';
    tableContainer.innerHTML = '<p class="placeholder">No summary available.</p>';
  }
});

exportWordBtn.addEventListener('click', async () => {
  if (!parsedSummary) {
    return;
  }

  const doc = createWordDocument(parsedSummary);
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, 'land-registry-summary.docx');
});

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += `\n\n[Page ${pageNumber}]\n${pageText}`;
  }

  return fullText;
}

function parseLandRegistryText(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const titleNumber = extractTitleNumber(normalized);
  const propertyDescription = extractSection(normalized, ['property register', 'property description', 'property']);
  const proprietorship = extractSection(normalized, ['proprietorship register', 'proprietorship']);
  const charges = extractSection(normalized, ['charges register', 'charges']);
  const restrictions = extractSection(normalized, ['restrictions register', 'restrictions']);

  return {
    titleNumber: normalizeValue(titleNumber),
    propertyDescription: normalizeValue(propertyDescription),
    proprietorship: normalizeValue(proprietorship),
    charges: normalizeValue(charges),
    restrictions: normalizeValue(restrictions),
  };
}

function extractTitleNumber(text) {
  const patterns = [
    /title\s*number\s*[:\-]?\s*([A-Za-z0-9\/\.\-]+)/i,
    /title\s*[:\-]?\s*([A-Za-z0-9\/\.\-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return '';
}

function extractSection(text, headings) {
  const pattern = new RegExp(`(${headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
  const headingMatch = text.match(pattern);

  if (!headingMatch) {
    return '';
  }

  const startIndex = headingMatch.index + headingMatch[0].length;
  const trailingMarkers = [
    /\b(proprietorship register|proprietorship|charges register|charges|restrictions register|restrictions)\b/i,
    /\btitle\s*number\b/i,
  ];

  let endIndex = text.length;
  for (const marker of trailingMarkers) {
    const markerMatch = text.slice(startIndex).search(marker);
    if (markerMatch >= 0) {
      const absoluteIndex = startIndex + markerMatch;
      if (absoluteIndex < endIndex) {
        endIndex = absoluteIndex;
      }
    }
  }

  const sectionText = text.slice(startIndex, endIndex).trim();
  return sectionText.replace(/^[:\-\s]+/, '').trim();
}

function normalizeValue(value) {
  if (!value || !value.toString().trim()) {
    return 'none';
  }
  return value;
}

function renderSummary(summary) {
  const rows = [
    ['Title number', summary.titleNumber],
    ['Land / property description', summary.propertyDescription],
    ['Legal proprietorship', summary.proprietorship],
    ['Charges', summary.charges],
    ['Restrictions', summary.restrictions],
  ];

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([field, detail]) => `<tr><th>${escapeHtml(field)}</th><td>${escapeHtml(detail)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = tableHtml;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createWordDocument(summary) {
  return new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'Land Registry Summary', bold: true, size: 28 })],
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Field')] }),
                new TableCell({ children: [new Paragraph('Details')] }),
              ],
            }),
            ...Object.entries(summary).map(([key, value]) => new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(formatLabel(key))] }),
                new TableCell({ children: [new Paragraph(value)] }),
              ],
            })),
          ],
        }),
      ],
    }],
  });
}

function formatLabel(key) {
  const labels = {
    titleNumber: 'Title number',
    propertyDescription: 'Land / property description',
    proprietorship: 'Legal proprietorship',
    charges: 'Charges',
    restrictions: 'Restrictions',
  };

  return labels[key] || key;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
