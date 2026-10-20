import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public/ocr');
mkdirSync(output, { recursive: true });
const core = join(root, 'node_modules/tesseract.js-core');
for (const name of readdirSync(core).filter((name) => /\.wasm(\.js)?$/.test(name))) {
  copyFileSync(join(core, name), join(output, name));
}
copyFileSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(output, 'worker.min.js'));
copyFileSync(join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), join(output, 'eng.traineddata.gz'));
