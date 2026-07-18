const NONE = 'none';

/**
 * Parse the text of an HM Land Registry official copy without sending it anywhere.
 * The parser intentionally extracts a concise transfer-oriented summary instead of
 * copying every entry from each register section.
 */
export function parseLandRegistryText(text) {
  const source = normalizeText(text);
  const titleNumber = source.match(/\bTitle\s+number\s+([A-Z]{1,4}\s*\d{3,})\b/i)?.[1]
    ?.replace(/\s+/g, '')
    .toUpperCase() || NONE;

  const cleaned = removePageFurniture(source);
  const propertySection = extractSection(cleaned, 'A', 'B');
  const proprietorshipSection = extractSection(cleaned, 'B', 'C');
  const chargesSection = extractSection(cleaned, 'C', null);

  const propertyEntries = parseEntries(propertySection);
  const proprietorshipEntries = parseEntries(proprietorshipSection);
  const chargeEntries = parseEntries(chargesSection);

  const propertyDescription = extractPropertyDescription(propertyEntries);
  const proprietorship = extractProprietorship(proprietorshipEntries);
  const restrictions = extractRestrictions(proprietorshipEntries);
  const charges = extractRegisteredCharges(chargeEntries);

  const warnings = [];
  if (titleNumber === NONE) warnings.push('Title number was not found.');
  if (propertyDescription === NONE) warnings.push('Property description was not found.');
  if (proprietorship === NONE) warnings.push('Legal proprietor was not found.');

  return {
    titleNumber,
    propertyDescription,
    proprietorship,
    charges,
    restrictions,
    warnings,
  };
}

export function textItemsToLines(items) {
  const lines = [];
  let line = '';

  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    line += item.str;
    if (item.hasEOL) {
      if (line.trim()) lines.push(line.trim());
      line = '';
    }
  }

  if (line.trim()) lines.push(line.trim());
  return lines;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function removePageFurniture(text) {
  return text
    .split('\n')
    .filter((line) => !/^\[Page \d+\]$/i.test(line))
    .filter((line) => !/^\d+\s+of\s+\d+$/i.test(line))
    .filter((line) => !/^Title\s+number\s+[A-Z]{1,4}\s*\d{3,}(?:\s+Edition\s+date.*)?$/i.test(line))
    .filter((line) => !/^[ABC]:\s*(?:Property|Proprietorship|Charges)\s+Register\s+continued$/i.test(line))
    .join('\n');
}

function extractSection(text, sectionLetter, nextSectionLetter) {
  const startPattern = new RegExp(`^${sectionLetter}:\\s*(?:Property|Proprietorship|Charges)\\s+Register(?:\\s+continued)?$`, 'im');
  const start = startPattern.exec(text);
  if (!start) return '';

  const contentStart = start.index + start[0].length;
  let contentEnd = text.length;

  if (nextSectionLetter) {
    const nextPattern = new RegExp(`^${nextSectionLetter}:\\s*(?:Property|Proprietorship|Charges)\\s+Register(?:\\s+continued)?$`, 'im');
    const next = nextPattern.exec(text.slice(contentStart));
    if (next) contentEnd = contentStart + next.index;
  } else {
    const end = /^End\s+of\s+register$/im.exec(text.slice(contentStart));
    if (end) contentEnd = contentStart + end.index;
  }

  return text.slice(contentStart, contentEnd).trim();
}

function parseEntries(section) {
  if (!section) return [];
  const lines = section
    .split('\n')
    .filter((line) => !/^This register\s+/i.test(line))
    .filter((line) => !/^any entries that affect\s+/i.test(line))
    .filter((line) => !/^Title (?:absolute|good leasehold|possessory|qualified)$/i.test(line))
    .filter((line) => !/^[A-Z][A-Z\s]+\s:\s[A-Z][A-Z\s]+$/.test(line));

  const entries = [];
  let current = null;

  for (const line of lines) {
    const start = line.match(/^(\d+)\s+\((\d{2}\.\d{2}\.\d{4})\)\s*(.*)$/);
    if (start) {
      if (current) entries.push(current);
      current = { number: Number(start[1]), date: start[2], text: start[3] };
    } else if (current) {
      current.text += ` ${line}`;
    }
  }
  if (current) entries.push(current);

  return entries.map((entry) => ({
    ...entry,
    text: cleanSpacing(entry.text),
  }));
}

function extractPropertyDescription(entries) {
  if (!entries.length) return NONE;
  const primary = entries[0];
  const beingMatch = primary.text.match(/\band\s+being\s+(.+)$/i);
  let description = beingMatch?.[1] || primary.text;
  description = stripNotes(description)
    .replace(/^The\s+(?:Freehold|Leasehold)\s+land\s+/i, '')
    .trim();

  const additions = entries.slice(1)
    .filter(({ text }) => isRelevantPropertyEntry(text))
    .map(({ text }) => stripNotes(text))
    .filter(Boolean);

  return joinDistinct([description, ...additions]);
}

function isRelevantPropertyEntry(text) {
  const rightsOnly = /\b(?:benefit of (?:the )?rights|rights? (?:granted|reserved)|right of way|right to use|easement|release of rights)\b/i.test(text);
  if (rightsOnly) return false;

  return /\b(?:mines?|minerals?|removed from this title|removed from the title|excluded from this registration|registered under the title number|edged and numbered in green|tinted (?:pink|blue|green|yellow|brown)|hatched (?:pink|blue|green|yellow|brown)|colou?red (?:pink|blue|green|yellow|brown))\b/i.test(text);
}

function extractProprietorship(entries) {
  const proprietorEntry = entries.find(({ text }) => /\bPROPRIETOR\s*:/i.test(text));
  if (!proprietorEntry) return NONE;

  const raw = proprietorEntry.text
    .split(/\bPROPRIETOR\s*:/i)[1]
    ?.split(/\s+of\s+/i)[0]
    ?.replace(/[.;,\s]+$/, '')
    .trim();

  if (!raw) return NONE;
  if (/\b(?:LIMITED|LTD|PLC|LLP|COUNCIL|AUTHORITY|COMPANY|CORPORATION|TRUSTEES?)\b/i.test(raw)) {
    return raw;
  }

  const people = raw.split(/\s+and\s+/i).map(formatPersonName).filter(Boolean);
  return collapseSharedSurname(people) || NONE;
}

function formatPersonName(name) {
  const suffixes = new Set(['BARONET', 'BT', 'KC', 'KBE', 'CBE', 'OBE', 'MBE']);
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const suffix = tokens.length && suffixes.has(tokens.at(-1).replace(/[.,]/g, '').toUpperCase())
    ? tokens.pop().replace(/[.,]/g, '')
    : '';

  if (tokens.length < 2) return titleCaseWords(name);
  const first = titleCaseWord(tokens[0]);
  const surname = titleCaseWord(tokens.at(-1));
  const middles = tokens.slice(1, -1).map((token) => {
    const cleaned = token.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, '');
    return cleaned ? cleaned[0].toUpperCase() : '';
  }).filter(Boolean);
  const formatted = [first, ...middles, surname].join(' ');
  return suffix ? `${formatted}, ${titleCaseWord(suffix)}` : formatted;
}

function collapseSharedSurname(people) {
  if (people.length < 2) return people[0] || '';
  const surnames = people.map((person) => getPersonSurname(person));
  if (!surnames.every((surname) => surname && surname === surnames[0])) {
    return people.join(' and ');
  }

  return people
    .map((person, index) => index === people.length - 1 ? person : removePersonSurname(person))
    .join(' and ');
}

function getPersonSurname(person) {
  const withoutSuffix = person.split(',')[0].trim();
  return withoutSuffix.split(/\s+/).at(-1)?.toLowerCase() || '';
}

function removePersonSurname(person) {
  const suffix = person.includes(',') ? `,${person.split(',').slice(1).join(',')}` : '';
  const base = person.split(',')[0].trim().split(/\s+/);
  base.pop();
  return `${base.join(' ')}${suffix}`;
}

function extractRestrictions(entries) {
  const restrictions = entries
    .filter(({ text }) => /\bRESTRICTION\s*:/i.test(text))
    .map(({ text }) => text.split(/\bRESTRICTION\s*:/i)[1]?.trim() || '')
    .filter((text) => !/\b(?:registered charge|charge dated|chargee|lender)\b/i.test(text))
    .map(simplifyRestriction)
    .filter(Boolean);

  return joinDistinct(restrictions);
}

function simplifyRestriction(text) {
  const clean = stripNotes(text);
  if (/No disposition by a sole proprietor[\s\S]*capital money arises[\s\S]*order of the court/i.test(clean)) {
    return 'A sole proprietor cannot transfer the property where capital money is involved unless authorised by a court order.';
  }
  return clean;
}

function extractRegisteredCharges(entries) {
  const charges = [];
  let activeCharge = null;

  for (const entry of entries) {
    const chargeMatch = entry.text.match(/\b(?:REGISTERED\s+)?CHARGE\s+dated\s+([0-9]{1,2}\s+[A-Za-z]+\s+\d{4})\b/i);
    if (chargeMatch) {
      activeCharge = { date: chargeMatch[1], proprietor: '' };
      const sameEntryProprietor = extractChargeProprietor(entry.text);
      if (sameEntryProprietor) activeCharge.proprietor = sameEntryProprietor;
      charges.push(activeCharge);
      continue;
    }

    const proprietor = extractChargeProprietor(entry.text);
    if (proprietor && activeCharge && !activeCharge.proprietor) {
      activeCharge.proprietor = proprietor;
    }
  }

  if (!charges.length) return NONE;
  return charges.map((charge) => {
    const base = `Registered charge dated ${charge.date}.`;
    return charge.proprietor ? `${base} Charge proprietor: ${charge.proprietor}.` : base;
  }).join(' ');
}

function extractChargeProprietor(text) {
  const match = text.match(/\bProprietor\s*:\s*(.+?)(?=\s+\(Co\.?\s*Regn|\s+of\s+|\s+whose\s+registered|[.;]|$)/i);
  return match?.[1]?.trim().replace(/[.,;]+$/, '') || '';
}

function stripNotes(text) {
  return cleanSpacing(String(text || '').split(/\bNOTE\s*:?\s*-?/i)[0])
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function joinDistinct(values) {
  const output = [];
  const seen = new Set();
  for (let value of values) {
    value = cleanSpacing(value).trim();
    if (!value) continue;
    if (!/[.!?]$/.test(value)) value += '.';
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }
  return output.join(' ') || NONE;
}

function cleanSpacing(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCaseWords(value) {
  return value.toLowerCase().replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
}

function titleCaseWord(value) {
  const upper = value.toUpperCase();
  if (['KC', 'KBE', 'CBE', 'OBE', 'MBE'].includes(upper)) return upper;
  return titleCaseWords(value);
}

export { NONE };
