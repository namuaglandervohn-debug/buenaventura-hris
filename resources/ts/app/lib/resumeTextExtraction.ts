import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Worker } from 'tesseract.js';

type Progress = (message: string) => void;

// Preserve PDF line breaks so labels and sections remain usable by the field parser.
export async function extractResumePdfText(
  pdf: PDFDocumentProxy,
  recognizePage: (page: PDFPageProxy) => Promise<string>,
  progress: Progress = () => {},
  signal?: AbortSignal,
) {
  const texts: string[] = [];
  try {
    if (pdf.numPages > 20) throw new Error('Please upload a resume with 20 pages or fewer.');
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted();
      progress(`Reading page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const embedded = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
        // Sparse text layers often contain only a scanner watermark over a scanned image.
        if (embedded.replace(/[^\p{L}\p{N}]/gu, '').length < 40) {
          progress(`Scanning page ${number} of ${pdf.numPages} with OCR…`);
          texts.push((await recognizePage(page)).trim() || embedded);
        } else {
          texts.push(embedded);
        }
      } finally { page.cleanup(); }
    }
    return texts.join('\n\n').trim();
  } finally { await pdf.destroy(); }
}

export async function readResumeFile(file: File, pdfWorkerUrl: string, progress: Progress, signal: AbortSignal) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Please upload a resume smaller than 20 MB.');
  signal.throwIfAborted();
  let worker: Worker | undefined;
  let scanLabel = 'Scanning resume';
  const abortWorker = () => { void worker?.terminate(); };
  signal.addEventListener('abort', abortWorker, { once: true });
  const recognize = async (image: File | HTMLCanvasElement) => {
    signal.throwIfAborted();
    if (!worker) {
      progress('Preparing text recognition…');
      const { createWorker, PSM } = await import('tesseract.js');
      const assets = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.origin).href;
      worker = await createWorker('eng', 1, {
        workerPath: `${assets}worker.min.js`, corePath: assets, langPath: assets.replace(/\/$/, ''),
        workerBlobURL: false,
        errorHandler: () => {},
        logger: (event) => {
          if (!signal.aborted && event.status === 'recognizing text') progress(`${scanLabel}… ${Math.round(event.progress * 100)}%`);
        },
      });
      signal.throwIfAborted();
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    }
    // Terminating an OCR worker does not settle an in-flight recognize promise.
    return await new Promise<string>((resolve, reject) => {
      const abort = () => reject(new DOMException('Scan cancelled.', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      worker!.recognize(image).then(({ data }) => resolve(data.text), reject)
        .finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  };
  try {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      return await extractResumePdfText(pdf, async (page) => {
        signal.throwIfAborted();
        // Render at about 144 DPI, bounded to avoid excessive canvas memory.
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 2600 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          const context = canvas.getContext('2d');
          if (!context) throw new Error('This browser could not prepare the scanned PDF.');
          await page.render({ canvasContext: context, viewport }).promise;
          return await recognize(canvas);
        } finally { canvas.width = canvas.height = 0; }
      }, (message) => { scanLabel = message.replace(/…$/, ''); progress(message); }, signal);
    }
    if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      progress('Reading DOCX resume…');
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value.trim();
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name)) return await recognize(file);
    if (file.type.startsWith('text/') || /\.(txt|csv)$/i.test(name)) return await file.text();
    throw new Error('Choose a PDF, DOCX, resume image, or text file.');
  } finally {
    signal.removeEventListener('abort', abortWorker);
    await worker?.terminate();
  }
}
