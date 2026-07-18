import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseLandRegistryText, textItemsToLines } from '../parser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function parsePdf(filename) {
  const data = new Uint8Array(fs.readFileSync(path.join(root, filename)));
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true, verbosity: 0 }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(`[Page ${pageNumber}]\n${textItemsToLines(content.items).join('\n')}`);
  }
  return parseLandRegistryText(pages.join('\n'));
}

test('extracts a simple title and ignores non-financial C-register entries', async () => {
  const result = await parsePdf('Official Copy (Register) - NK260265 - The Bungalow - Peter.pdf');
  assert.deepEqual(result, {
    titleNumber: 'NK260265',
    propertyDescription: 'The Bungalow, The Street, Erpingham, (NR11 7QD).',
    proprietorship: 'Peter Willcox',
    charges: 'none',
    restrictions: 'none',
    warnings: [],
  });
});

test('condenses middle names to initials and excludes rights-release entries', async () => {
  const result = await parsePdf('Official Copy (Register) - NK383764 - Thomas H.pdf');
  assert.equal(result.titleNumber, 'NK383764');
  assert.equal(result.propertyDescription, 'land at Hargham, Norwich.');
  assert.equal(result.proprietorship, 'Thomas H C Beevor');
  assert.equal(result.charges, 'none');
  assert.equal(result.restrictions, 'none');
});

test('keeps mineral and plan-removal details across continuation pages', async () => {
  const result = await parsePdf('Official Copy (Register) - SK290349 - Heath Farm - John and Rosie.pdf');
  assert.equal(result.titleNumber, 'SK290349');
  assert.match(result.propertyDescription, /^Heath Farm, Coney Weston/);
  assert.match(result.propertyDescription, /mines and minerals excepted/);
  assert.match(result.propertyDescription, /removed from this title/);
  assert.equal(result.proprietorship, 'John K and Rosemary A Bucher');
  assert.equal(result.charges, 'none');
  assert.equal(result.restrictions, 'A sole proprietor cannot transfer the property where capital money is involved unless authorised by a court order.');
});

test('matches the supplied CB449215 example and adds its annotated restriction', async () => {
  const result = await parsePdf('Official Copy (Title Register) CB449215 - Cynthia & Dale.pdf');
  assert.equal(result.titleNumber, 'CB449215');
  assert.match(result.propertyDescription, /^Land on the west side of Pymoor Lane/);
  assert.match(result.propertyDescription, /numbered in green/);
  assert.equal(result.proprietorship, 'Cynthia and Dale R Parson');
  assert.equal(result.charges, 'none');
  assert.match(result.restrictions, /sole proprietor cannot transfer/);
});

test('combines a registered charge with its charge proprietor', () => {
  const text = `
Title number CB396834 Edition date 22.02.2016
A: Property Register
This register describes the land and estate comprised in the title.
1 (09.01.2015) The Freehold land shown edged with red on the plan and being Land at Second Drove, Little Downham.
B: Proprietorship Register
This register specifies the class of title and identifies the owner.
Title absolute
1 (09.01.2015) PROPRIETOR: DALE ROGER PARSON of Laurel Farm, Ely.
C: Charges Register
This register contains any charges and other matters that affect the land.
1 (22.02.2016) REGISTERED CHARGE dated 17 February 2016 affecting also other titles.
2 (22.02.2016) Proprietor: THE AGRICULTURAL MORTGAGE CORPORATION PLC (Co. Regn. No. 234742) of Charlton Place.
End of register`;
  const result = parseLandRegistryText(text);
  assert.equal(result.charges, 'Registered charge dated 17 February 2016. Charge proprietor: THE AGRICULTURAL MORTGAGE CORPORATION PLC.');
});
