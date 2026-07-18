import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { Packer } from '../vendor/docx.mjs';
import { createWordDocument } from '../word.mjs';

test('creates a valid landscape Word document with the requested five-column table', async () => {
  const document = createWordDocument([{
    titleNumber: 'CB449215',
    propertyDescription: 'Land on the west side of Pymoor Lane, Pymoor, Ely.',
    proprietorship: 'Cynthia and Dale R Parson',
    charges: 'none',
    restrictions: 'A sole proprietor cannot transfer the property where capital money is involved unless authorised by a court order.',
  }]);

  const buffer = await Packer.toBuffer(document);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');

  assert.ok(zip.file('[Content_Types].xml'));
  assert.match(xml, /w:orient="landscape"/);
  assert.match(xml, /Title Register Summary/);
  assert.match(xml, /Land \/ property description/);
  assert.match(xml, /CB449215/);
  assert.equal((xml.match(/<w:tc>/g) || []).length, 10);
  assert.match(xml, /w:tblHeader/);
  assert.match(xml, /w:fill="174A3B"/);
});
