import test from 'node:test';
import assert from 'node:assert/strict';
import { extractResumePdfText } from '../resources/ts/app/lib/resumeTextExtraction.ts';

function document(pages) {
  const cleaned = [];
  let destroyed = false;
  return {
    cleaned, get destroyed() { return destroyed; }, numPages: pages.length,
    async getPage(number) {
      return { number, getTextContent: async () => ({ items: pages[number - 1] }), cleanup: () => cleaned.push(number) };
    },
    async destroy() { destroyed = true; },
  };
}

test('mixed PDFs retain embedded text and OCR only scanned or watermark-only pages, in order', async () => {
  const text = 'FIRST LAST - Resume containing selectable text and contact information';
  const pdf = document([[{ str: text, hasEOL: true }, { str: 'Email: applicant@example.com' }], [], [{ str: 'Scanned by device' }]]);
  const scanned = [];
  const result = await extractResumePdfText(pdf, async page => { scanned.push(page.number); return `Scanned resume page ${page.number}`; });
  assert.deepEqual(scanned, [2, 3]);
  assert.equal(result, `${text}\nEmail: applicant@example.com\n\nScanned resume page 2\n\nScanned resume page 3`);
  assert.deepEqual(pdf.cleaned, [1, 2, 3]);
  assert.equal(pdf.destroyed, true);
});

test('failed OCR releases page and PDF resources and propagates the error', async () => {
  const pdf = document([[]]);
  await assert.rejects(extractResumePdfText(pdf, async () => { throw Error('OCR failed'); }), /OCR failed/);
  assert.deepEqual(pdf.cleaned, [1]);
  assert.equal(pdf.destroyed, true);
});

test('blank pages do not invent text and sparse embedded text is preserved when OCR finds nothing', async () => {
  const pdf = document([[], [{ str: 'Short text' }]]);
  assert.equal(await extractResumePdfText(pdf, async () => ''), 'Short text');
});

test('cancelled and oversized documents stop without scanning and release the PDF', async () => {
  const controller = new AbortController();
  controller.abort();
  const pdf = document([[]]);
  await assert.rejects(extractResumePdfText(pdf, () => assert.fail('Must not scan'), undefined, controller.signal), { name: 'AbortError' });
  assert.equal(pdf.destroyed, true);
  const large = document(Array(21).fill([]));
  await assert.rejects(extractResumePdfText(large, () => assert.fail('Must not scan')), /20 pages/);
  assert.equal(large.destroyed, true);
});
