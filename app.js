import * as pdfjsLib from './vendor/pdf.mjs';
import { Packer } from './vendor/docx.mjs';
import { parseLandRegistryText, textItemsToLines } from './parser.mjs';
import { createWordDocument } from './word.mjs';

const pdfInput = document.getElementById('pdfInput');
const dropZone = document.getElementById('dropZone');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('resultsSection');
const tableBody = document.getElementById('summaryTableBody');
const reviewNotice = document.getElementById('reviewNotice');
const exportWordBtn = document.getElementById('exportWordBtn');
const clearBtn = document.getElementById('clearBtn');

const fields = ['titleNumber', 'propertyDescription', 'proprietorship', 'charges', 'restrictions'];
let summaries = [];

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

pdfInput.addEventListener('change', () => processFiles(pdfInput.files));

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
}

dropZone.addEventListener('drop', (event) => processFiles(event.dataTransfer?.files));

tableBody.addEventListener('input', (event) => {
  const cell = event.target.closest('[data-field]');
  if (!cell) return;
  const index = Number(cell.dataset.index);
  const field = cell.dataset.field;
  if (summaries[index] && fields.includes(field)) {
    summaries[index][field] = cell.innerText.trim() || 'none';
  }
});

clearBtn.addEventListener('click', () => {
  summaries = [];
  pdfInput.value = '';
  renderSummaries();
  setStatus('No documents added yet.');
});

exportWordBtn.addEventListener('click', async () => {
  if (!summaries.length) return;
  exportWordBtn.disabled = true;
  setStatus('Building the editable Word document…', 'working');
  try {
    const blob = await Packer.toBlob(createWordDocument(summaries));
    const filename = summaries.length === 1 && summaries[0].titleNumber !== 'none'
      ? `${summaries[0].titleNumber}-title-register-summary.docx`
      : 'title-register-summary.docx';
    triggerDownload(blob, filename);
    setStatus(`Word table ready — ${summaries.length} ${pluralise('title', summaries.length)} included.`, 'success');
  } catch (error) {
    console.error(error);
    setStatus('The Word document could not be created. Please try again.', 'error');
  } finally {
    exportWordBtn.disabled = false;
  }
});

async function processFiles(fileList) {
  const files = [...(fileList || [])].filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!files.length) {
    setStatus('Please choose one or more PDF files.', 'error');
    return;
  }

  let failures = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    setStatus(`Reading ${index + 1} of ${files.length}: ${file.name}`, 'working');
    try {
      const text = await extractTextFromPdf(file);
      const parsed = { ...parseLandRegistryText(text), sourceFile: file.name };
      const existingIndex = parsed.titleNumber !== 'none'
        ? summaries.findIndex((summary) => summary.titleNumber === parsed.titleNumber)
        : -1;
      if (existingIndex >= 0) summaries[existingIndex] = parsed;
      else summaries.push(parsed);
    } catch (error) {
      failures += 1;
      console.error(`Could not process ${file.name}`, error);
    }
  }

  renderSummaries();
  pdfInput.value = '';
  if (!summaries.length) {
    setStatus('No readable title registers were found. The PDF must contain selectable text.', 'error');
  } else if (failures) {
    setStatus(`${summaries.length} ${pluralise('title', summaries.length)} ready; ${failures} ${pluralise('file', failures)} could not be read.`, 'error');
  } else {
    setStatus(`${summaries.length} ${pluralise('title', summaries.length)} ready for review and Word export.`, 'success');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = textItemsToLines(textContent.items);
    pages.push(`[Page ${pageNumber}]\n${lines.join('\n')}`);
  }

  return pages.join('\n');
}

function renderSummaries() {
  tableBody.replaceChildren();
  resultsSection.hidden = summaries.length === 0;
  if (!summaries.length) return;

  summaries.forEach((summary, index) => {
    const row = document.createElement('tr');
    fields.forEach((field) => {
      const cell = document.createElement('td');
      cell.contentEditable = 'true';
      cell.spellcheck = true;
      cell.dataset.index = String(index);
      cell.dataset.field = field;
      cell.textContent = summary[field];
      cell.title = `Edit ${fieldLabel(field)}`;
      row.appendChild(cell);
    });
    tableBody.appendChild(row);
  });

  const flagged = summaries.filter((summary) => summary.warnings?.length);
  reviewNotice.hidden = flagged.length === 0;
  if (flagged.length) {
    reviewNotice.textContent = `${flagged.length} ${pluralise('row', flagged.length)} need a quick check because a core field was not confidently found: ${flagged.map((summary) => summary.titleNumber).join(', ')}.`;
  }
}

function setStatus(message, type = '') {
  statusEl.className = `status${type ? ` is-${type}` : ''}`;
  statusEl.querySelector('span:last-child').textContent = message;
}

function fieldLabel(field) {
  return ({
    titleNumber: 'title number',
    propertyDescription: 'land / property description',
    proprietorship: 'legal proprietorship',
    charges: 'charges',
    restrictions: 'restrictions',
  })[field] || field;
}

function pluralise(word, count) {
  return count === 1 ? word : `${word}s`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
