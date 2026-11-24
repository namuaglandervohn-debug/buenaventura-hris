export type ScheduleCrop = { left: number; top: number; right: number; bottom: number };
type Stroke = { at: number; start: number; end: number };
type Rule = Stroke & { firstLine: number; lastLine: number };

export const fullSchedulePhoto: ScheduleCrop = { left: 0, top: 0, right: 1, bottom: 1 };

function findStrokes(
  firstLine: number,
  lastLine: number,
  firstPixel: number,
  lastPixel: number,
  dark: (line: number, pixel: number) => boolean,
  minimumLength: number,
) {
  const maxGap = Math.max(2, Math.round((lastPixel - firstPixel) * .018));
  const maxThickness = Math.max(3, Math.round((lastLine - firstLine) * .023));
  const strokes: Rule[] = [];
  let bandStart = -1;
  let best: Stroke | undefined;

  for (let line = firstLine; line <= lastLine; line++) {
    let start = -1;
    let end = -1;
    let ink = 0;
    let span: Stroke | undefined;
    for (let pixel = firstPixel; line < lastLine && pixel <= lastPixel; pixel++) {
      const isDark = pixel < lastPixel && dark(line, pixel);
      if (isDark && (start < 0 || pixel - end <= maxGap)) {
        if (start < 0) start = pixel;
        end = pixel;
        ink++;
        continue;
      }
      if (start < 0 || (!isDark && pixel - end < maxGap && pixel < lastPixel)) continue;
      const length = end - start + 1;
      if (length >= minimumLength && ink >= length * .78 && (!span || length > span.end - span.start + 1)) {
        span = { at: line, start, end };
      }
      start = end = isDark ? pixel : -1;
      ink = isDark ? 1 : 0;
    }

    if (span) {
      if (bandStart < 0) bandStart = line;
      if (!best || span.end - span.start > best.end - best.start) best = span;
    } else if (best) {
      if (line - bandStart <= maxThickness) strokes.push({ ...best, firstLine: bandStart, lastLine: line - 1 });
      bandStart = -1;
      best = undefined;
    }
  }
  return strokes;
}

function findDarkPixels({ data, width, height }: Pick<ImageData, 'data' | 'width' | 'height'>) {
  const darkPixels = new Uint8Array(width * height);
  for (let index = 0; index < darkPixels.length; index++) {
    const offset = index * 4;
    darkPixels[index] = Number(data[offset + 3] >= 128 &&
      .299 * data[offset] + .587 * data[offset + 1] + .114 * data[offset + 2] < 155);
  }
  return (y: number, x: number) => darkPixels[y * width + x] === 1;
}

/** Find a table only when long horizontal rules and several matching vertical rules agree. */
export function detectScheduleTable(image: Pick<ImageData, 'data' | 'width' | 'height'>): ScheduleCrop | null {
  const { width, height } = image;
  const dark = findDarkPixels(image);
  const horizontal = findStrokes(0, height, 0, width, dark, width * .34);
  let best: { crop: ScheduleCrop; score: number } | undefined;
  for (const anchor of horizontal) {
    const tolerance = Math.max(6, (anchor.end - anchor.start) * .075);
    const aligned = horizontal.filter(rule => Math.abs(rule.start - anchor.start) <= tolerance
      && Math.abs(rule.end - anchor.end) <= tolerance);
    if (aligned.length < 3 || aligned[aligned.length - 1].at - aligned[0].at < height * .11) continue;
    const top = aligned[0].at;
    const bottom = aligned[aligned.length - 1].at;
    const left = Math.min(...aligned.map(rule => rule.start));
    const right = Math.max(...aligned.map(rule => rule.end));
    const tableWidth = right - left;
    const tableHeight = bottom - top;
    const vertical = findStrokes(Math.max(0, left - 2), Math.min(width, right + 3), top, bottom + 1,
      (x, y) => dark(y, x), tableHeight * .63);
    if (vertical.length < 6 || vertical[0].at > left + tolerance
      || vertical[vertical.length - 1].at < right - tolerance) continue;

    const crop = {
      left: Math.max(0, left - tableWidth * .025) / width,
      top: Math.max(0, top - Math.max(12, tableHeight * .17)) / height,
      right: Math.min(width, right + tableWidth * .025) / width,
      bottom: Math.min(height, bottom + tableHeight * .045) / height,
    };
    if ((crop.right - crop.left) * (crop.bottom - crop.top) > .93) continue;
    const score = tableWidth * tableHeight * Math.min(vertical.length, 10);
    if (!best || score > best.score) best = { crop, score };
  }
  return best?.crop ?? null;
}

/** Remove verified grid rules from the OCR copy so letters stay in separate columns. */
export function eraseScheduleGrid(image: Pick<ImageData, 'data' | 'width' | 'height'>) {
  const { data, width, height } = image;
  const dark = findDarkPixels(image);
  const rows = findStrokes(0, height, 0, width, dark, width * .6);
  const columns = findStrokes(0, width, 0, height, (x, y) => dark(y, x), height * .55);
  if (rows.length < 3 || columns.length < 6) return false;
  for (const row of rows) {
    for (let y = Math.max(0, row.firstLine - 1); y <= Math.min(height - 1, row.lastLine + 1); y++) {
      data.fill(255, (y * width + row.start) * 4, (y * width + row.end + 1) * 4);
    }
  }
  for (const column of columns) {
    const first = Math.max(0, column.firstLine - 1);
    const last = Math.min(width, column.lastLine + 2);
    for (let y = column.start; y <= column.end; y++) {
      data.fill(255, (y * width + first) * 4, (y * width + last) * 4);
    }
  }
  return true;
}

function renderCrop(image: HTMLImageElement, crop: ScheduleCrop, angle: number, limit: number, enlarge = false) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const radians = angle * Math.PI / 180;
  const rotatedWidth = width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians));
  const rotatedHeight = width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians));
  const cropWidth = (crop.right - crop.left) * rotatedWidth;
  const cropHeight = (crop.bottom - crop.top) * rotatedHeight;
  if (!(cropWidth > 0 && cropHeight > 0)) throw new Error('Select a larger part of the schedule photo.');
  const scale = Math.min(limit / Math.max(cropWidth, cropHeight), enlarge ? Math.max(1, 900 / cropWidth) : 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(cropWidth * scale));
  canvas.height = Math.max(1, Math.ceil(cropHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: !enlarge });
  if (!ctx) throw new Error('This browser could not crop the schedule photo.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(rotatedWidth * (.5 - crop.left), rotatedHeight * (.5 - crop.top));
  ctx.rotate(radians);
  ctx.drawImage(image, -width / 2, -height / 2);
  if (enlarge) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (eraseScheduleGrid(pixels)) ctx.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export function cropSchedulePhoto(image: HTMLImageElement, crop: ScheduleCrop) {
  return renderCrop(image, crop, 0, 3200, true);
}

export async function findAutomaticScheduleCrop(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    try { await image.decode(); } catch { return null; }
    for (const angle of [0, -3, 3, -6, 6, -9, 9]) {
      const preview = renderCrop(image, fullSchedulePhoto, angle, 950);
      const pixels = preview.getContext('2d')?.getImageData(0, 0, preview.width, preview.height);
      const crop = pixels && detectScheduleTable(pixels);
      if (crop) return renderCrop(image, crop, angle, 3200, true);
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
