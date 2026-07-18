# TitleBrief

TitleBrief converts selectable-text HM Land Registry official-copy PDFs into a concise title summary and an editable Microsoft Word table. Everything runs in the browser: no documents are uploaded and no LLM or external API is used.

## What it extracts

- title number;
- the property description after “and being”;
- useful plan/removal/mineral entries from the Property Register;
- registered proprietor names without addresses, with middle names condensed to initials;
- registered mortgage/charge dates and charge proprietors;
- relevant Proprietorship Register disposal restrictions, with the common sole-proprietor restriction written in plain English.

Entries concerning easements, benefits of rights, rights granted/reserved, restrictive covenants and leases are not mislabelled as financial charges. A missing field is output as `none`.

## Use locally

Opening ES modules directly from `file://` is restricted by most browsers, so serve the folder locally:

```powershell
npm install
npm start
```

Then open the address printed in the terminal. Add one or more PDFs, review the editable cells, and select **Download Word table**.

## Publish on GitHub Pages

There is no build step. Publish the repository root through **Settings → Pages → Deploy from a branch** and select the relevant branch and `/ (root)` folder.

The files under `vendor/` are browser-ready copies of PDF.js and docx, which lets the deployed site run without a package CDN.

## Test

```powershell
npm test
```

The automated suite parses the supplied real registers, checks the annotated extraction rules, distinguishes actual mortgages from other Charges Register matters, and inspects the generated Word XML.

## Scope

This is a first-pass review aid, not a replacement for the official register or title plan. PDFs must contain selectable text; image-only scans would need OCR, which is intentionally outside this private deterministic version.
