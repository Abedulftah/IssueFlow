import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures');

export const fixtures = {
  tinyPngPath: path.join(FIXTURES_DIR, 'tiny.png'),
  tinyTxtPath: path.join(FIXTURES_DIR, 'tiny.txt'),
};

export function readFixture(filename: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename));
}

export function buildOversizedBuffer(megabytes: number): Buffer {
  return Buffer.alloc(megabytes * 1024 * 1024, 'a');
}
