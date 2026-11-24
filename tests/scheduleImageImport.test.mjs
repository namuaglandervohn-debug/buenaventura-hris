import assert from 'node:assert/strict';
import test from 'node:test';
import { detectScheduleTable, eraseScheduleGrid } from '../resources/ts/app/lib/scheduleImageCrop.ts';
import {
  parseSchedulePhoto, readScheduleWithCrop, UnreadableSchedulePhoto,
} from '../resources/ts/app/lib/scheduleImageImport.ts';

function raster(width, height, draw) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  draw((left, top, right, bottom) => {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const index = (y * width + x) * 4;
        data.fill(30, index, index + 3);
      }
    }
  });
  return { data, width, height };
}

test('the automatic crop contains the whole schedule grid and leaves a margin for the date heading', () => {
  const photo = raster(1000, 720, rule => {
    rule(0, 0, 1000, 24);
    for (const y of [210, 255, 300, 345, 390, 435, 480]) rule(130, y, 882, y + 2);
    for (const x of [130, 260, 340, 420, 500, 580, 660, 740, 810, 880]) rule(x, 210, x + 2, 482);
  });
  const crop = detectScheduleTable(photo);
  assert.ok(crop);
  assert.ok(crop.left < .13 && crop.left > .08);
  assert.ok(crop.right > .882 && crop.right < .93);
  assert.ok(crop.top * 720 < 180 && crop.top * 720 > 130);
  assert.ok(crop.bottom * 720 >= 482 && crop.bottom * 720 < 540);
});

test('a page outline and text underlines do not qualify as a schedule grid', () => {
  const photo = raster(800, 600, rule => {
    rule(50, 40, 752, 42);
    rule(50, 559, 752, 561);
    rule(50, 40, 52, 561);
    rule(750, 40, 752, 561);
    rule(100, 190, 700, 192);
    rule(100, 230, 700, 232);
    rule(100, 270, 700, 272);
  });
  assert.equal(detectScheduleTable(photo), null);
  assert.equal(eraseScheduleGrid(photo), false);
});

test('grid cleanup removes table lines without erasing a separate weekday heading', () => {
  const photo = raster(800, 480, rule => {
    for (const y of [70, 124, 178, 232, 286, 340, 394]) rule(18, y, 784, y + 2);
    for (const x of [18, 145, 236, 327, 418, 509, 600, 691, 782]) rule(x, 70, x + 2, 396);
    rule(165, 93, 190, 101);
  });
  assert.equal(eraseScheduleGrid(photo), true);
  const ink = (x, y) => photo.data[(y * photo.width + x) * 4];
  assert.equal(ink(150, 124), 255);
  assert.equal(ink(145, 94), 255);
  assert.equal(ink(171, 95), 30);
});

test('a readable photo skips cropping', async () => {
  const result = await readScheduleWithCrop('original', async image => {
    assert.equal(image, 'original');
    return 'schedule';
  }, async () => assert.fail('A readable image must not be cropped.'));
  assert.equal(result, 'schedule');
});

test('an unreadable photo gets one automatic retry before offering manual crop', async () => {
  for (const [crop, expected] of [['crop', 'schedule'], ['bad crop', null], [null, null]]) {
    const attempts = [];
    const result = await readScheduleWithCrop('original', async image => {
      attempts.push(image);
      if (image !== 'crop') throw new UnreadableSchedulePhoto();
      return 'schedule';
    }, async () => crop);
    assert.equal(result, expected);
    assert.deepEqual(attempts, crop ? ['original', crop] : ['original']);
  }
});

test('OCR worker failures do not get treated as bad crops', async () => {
  await assert.rejects(readScheduleWithCrop('original', async () => {
    throw new Error('OCR worker unavailable');
  }, async () => assert.fail('An unavailable worker cannot retry a crop.')), /worker unavailable/);
});

test('recognized weekday headings without readable shifts still trigger the crop fallback', () => {
  const word = (text, x, y) => ({ text, bbox: { x0: x, x1: x + 22, y0: y, y1: y + 11 } });
  const headings = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => word(day, 200 + i * 100, 45));
  const words = [...headings, word('Jamie', 30, 105)];
  assert.throws(() => parseSchedulePhoto([{ text: '', words }], () => 'employee-1'), UnreadableSchedulePhoto);
  const result = parseSchedulePhoto([{ text: '', words: [...words, word('RD', 200, 105)] }], () => 'employee-1');
  assert.equal(result.rows[0].shifts.monday, 'RD');
});
