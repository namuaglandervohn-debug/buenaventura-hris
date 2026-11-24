import type { Page, Word } from 'tesseract.js';
import { parseRegularScheduleShift } from './regularScheduleShift.ts';

export const schedulePhotoDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = (typeof schedulePhotoDays)[number];
type PhotoWord = Pick<Word, 'text' | 'bbox'>;
type PhotoPage = { words: PhotoWord[]; text: string };

export class UnreadableSchedulePhoto extends Error {}

export async function readScheduleWithCrop<Original, Cropped, Result>(
  original: Original,
  read: (image: Original | Cropped) => Promise<Result>,
  findCrop: (image: Original) => Promise<Cropped | null>,
): Promise<Result | null> {
  try {
    return await read(original);
  } catch (error) {
    if (!(error instanceof UnreadableSchedulePhoto)) throw error;
  }
  const crop = await findCrop(original);
  if (!crop) return null;
  try {
    return await read(crop);
  } catch (error) {
    if (!(error instanceof UnreadableSchedulePhoto)) throw error;
    return null;
  }
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const centerX = ({ bbox }: PhotoWord) => (bbox.x0 + bbox.x1) / 2;
const centerY = ({ bbox }: PhotoWord) => (bbox.y0 + bbox.y1) / 2;
const byX = (a: PhotoWord, b: PhotoWord) => a.bbox.x0 - b.bbox.x0;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const weekday = (word: PhotoWord) => {
  const text = word.text.toLowerCase().replace(/[^a-z]/g, '');
  return schedulePhotoDays.findIndex(day => text === day || text === day.slice(0, 3));
};

export function readSchedulePhotoPage(page: Page): PhotoPage {
  return {
    text: page.text ?? '',
    words: (page.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words))),
  };
}

// A printed table can be split into several OCR lines and blocks.
function findHeader(words: PhotoWord[]) {
  const days = words.filter(word => weekday(word) >= 0);
  let best: PhotoWord[] = [];
  for (const anchor of days) {
    const tolerance = Math.max(8, (anchor.bbox.y1 - anchor.bbox.y0) * 1.5);
    const row = days.filter(word => Math.abs(centerY(word) - centerY(anchor)) <= tolerance).sort(byX);
    const ordered: PhotoWord[] = [];
    for (const word of row) {
      if (!ordered.length || weekday(word) > weekday(ordered[ordered.length - 1])) ordered.push(word);
    }
    if (ordered.length > best.length) best = ordered;
  }
  if (best.length < 4) return null;
  const gap = median(best.slice(1).map((word, index) =>
    (centerX(word) - centerX(best[index])) / (weekday(word) - weekday(best[index]))));
  if (gap <= 0) return null;
  const first = median(best.map(word => centerX(word) - weekday(word) * gap));
  return { count: best.length, gap, first, y: median(best.map(centerY)), bottom: Math.max(...best.map(word => word.bbox.y1)) };
}

function readWeek(pages: PhotoPage[], header: NonNullable<ReturnType<typeof findHeader>>) {
  const text = pages.map(page => page.text).join('\n');
  const range = text.match(/\b([a-z]{3,9}\s+\d{1,2}\s*[-–—]\s*(?:[a-z]{3,9}\s+)?\d{1,2}),?\s+(\d{4})\b/i);
  if (range) return `${range[1]}, ${range[2]}`;
  const monthYear = text.match(new RegExp(`\\b(${months.join('|')})\\s+(\\d{4})\\b`, 'i'));
  if (!monthYear) return '';
  const month = months.findIndex(name => name.toLowerCase() === monthYear[1].toLowerCase());
  const year = Number(monthYear[2]);
  const votes = new Map<number, Set<number>>();
  for (const word of pages.flatMap(page => page.words)) {
    const y = centerY(word);
    if (y <= header.bottom || y > header.bottom + header.gap * .23 || !/^\d{1,2}$/.test(word.text)) continue;
    const column = Math.round((centerX(word) - header.first) / header.gap);
    const monday = Number(word.text) - column;
    if (column < 0 || column > 6 || monday < 1) continue;
    const start = new Date(Date.UTC(year, month, monday));
    if (start.getUTCMonth() !== month || start.getUTCDay() !== 1) continue;
    const columns = votes.get(monday) ?? new Set<number>();
    columns.add(column);
    votes.set(monday, columns);
  }
  const [winner, runnerUp] = [...votes].sort((a, b) => b[1].size - a[1].size);
  if (!winner || winner[1].size < 3 || winner[1].size === runnerUp?.[1].size) return '';
  const monday = winner[0];
  const end = new Date(Date.UTC(year, month, monday + 6));
  return end.getUTCMonth() === month
    ? `${months[month]} ${monday}–${end.getUTCDate()}, ${year}`
    : `${months[month]} ${monday} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export function normalizePhotoShift(value: string): string | null {
  const text = value.trim();
  const markers = /^(rd|rest\s*day|off|flex|suspended|leave)$/i.exec(text);
  if (markers) return /^rd$/i.test(text) || /^rest\s*day$/i.test(text) ? 'RD' : text.toUpperCase();
  const fullShift = parseRegularScheduleShift(text);
  if (fullShift) return fullShift.label;

  // In printed shifts such as 9am-1pm/5-9pm, fill omitted meridiems only
  // when one interpretation gives the uniquely shortest ordered shift.
  const periods = text.toUpperCase().replace(/\s/g, '').split('/');
  if (periods.length > 2) return null;
  const options = periods.flatMap(period => period.split(/[-–—]/)).map(clock => {
    const match = /^(1[0-2]|0?[1-9])(?::([0-5]\d))?(AM|PM)?$/.exec(clock);
    if (!match) return [];
    const [, hour, minute = '00', meridiem] = match;
    return (meridiem ? [meridiem] : ['AM', 'PM']).map(part => `${hour}:${minute} ${part}`);
  });
  if (periods.some(period => period.split(/[-–—]/).length !== 2) || !/AM|PM/i.test(text)) return null;

  const choices = options.reduce<string[][]>(
    (prefixes, clocks) => prefixes.flatMap(prefix => clocks.map(clock => [...prefix, clock])), [[]],
  ).flatMap(clocks => {
    const ranges = [clocks.slice(0, 2).join(' - '), clocks.slice(2).join(' - ')].filter(Boolean);
    const shift = parseRegularScheduleShift(ranges.join(' / '));
    return shift ? [{ label: shift.label, span: shift.intervals[shift.intervals.length - 1][1] - shift.intervals[0][0] }] : [];
  }).sort((a, b) => a.span - b.span);
  return choices[0] && choices[0].span !== choices[1]?.span ? choices[0].label : null;
}

export function parseSchedulePhoto(pages: PhotoPage[], matchEmployee: (name: string) => string | undefined) {
  const words = pages.flatMap(page => page.words);
  const header = findHeader(words);
  if (!header) throw new UnreadableSchedulePhoto('The weekday headings could not be detected.');
  const firstBoundary = header.first - header.gap / 2;
  const positionHeader = words.find(word => /^position$/i.test(word.text) && Math.abs(centerY(word) - header.y) < 24);
  const positionWords = words.filter(word => word.bbox.x0 < firstBoundary
    && centerY(word) > header.bottom && /^(?:supervisor|leadman|server|cashier|reliever|attendant)$/i.test(word.text.replace(/^[^a-z]+/i, '')));
  const positionStart = positionWords.length >= 3
    ? Math.min(positionHeader?.bbox.x0 ?? Infinity, median(positionWords.map(word => word.bbox.x0)))
    : positionHeader?.bbox.x0;
  const nameBoundary = positionStart == null ? firstBoundary : positionStart - header.gap * .08;
  const leftWords = words.filter(word => centerX(word) < nameBoundary && centerY(word) > header.bottom && /[a-z]{2,}/i.test(word.text));
  const typicalHeight = median(leftWords.map(word => word.bbox.y1 - word.bbox.y0));
  const tolerance = Math.max(8, typicalHeight * .85);
  const bands: number[][] = [];
  for (const y of leftWords.map(centerY).sort((a, b) => a - b)) {
    const last = bands[bands.length - 1];
    if (last && y - median(last) <= tolerance) last.push(y);
    else bands.push([y]);
  }
  const candidates = bands.flatMap(band => {
    const y = median(band);
    const rowWords = pages.map(page => page.words
      .filter(word => Math.abs(centerY(word) - y) <= tolerance * 1.35)
      .sort(byX));
    const names = rowWords.map(row => row.filter(word => centerX(word) < nameBoundary)
      .map(word => word.text).join(' ').replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').trim()).filter(Boolean);
    const matched = names.map(name => ({ name, id: matchEmployee(name) })).find(item => item.id);
    const detectedName = matched?.name ?? names[0];
    if (!detectedName || /^(?:name\b|maria clara\b|buenaventura\b|café\b|cafe\b|resto\b|pool bar\b|meal\b|total\b|note\b|prepared\b|verified\b|approved\b)/i.test(detectedName)) return [];
    let recognized = 0;
    const uncertainDays: Day[] = [];
    const shifts = Object.fromEntries(schedulePhotoDays.map((day, index) => {
      const column = rowWords.map(row => row.filter(word => Math.floor((centerX(word) - firstBoundary) / header.gap) === index)
        .map(word => word.text).join(' ').replace(/^[\s|\[\]_,]+|[\s|\[\]_,]+$/g, ''));
      const values = column.map(normalizePhotoShift).filter((shift): shift is string => Boolean(shift));
      if (values.length) recognized++;
      if (new Set(values).size > 1 || !values.length) uncertainDays.push(day);
      return [day, values[0] ?? column.find(Boolean) ?? ''];
    })) as Record<Day, string>;
    const hasPosition = positionStart != null && positionWords.some(word => Math.abs(centerY(word) - y) <= tolerance * 1.35);
    if (!matched && !hasPosition && recognized < 2) return [];
    return [{ y, row: { detectedName, employeeId: matched?.id ?? '', shifts, uncertainDays } }];
  });
  const rows = candidates.filter(({ y, row }, index) => !candidates.slice(0, index).some(previous =>
    y - previous.y <= tolerance * 2
    && (row.employeeId ? row.employeeId === previous.row.employeeId : row.detectedName === previous.row.detectedName),
  )).map(candidate => candidate.row);
  if (!rows.some(row => row.uncertainDays.length < schedulePhotoDays.length)) {
    throw new UnreadableSchedulePhoto('No readable shifts were found under the weekday headings.');
  }
  return { rows, week: readWeek(pages, header) };
}
