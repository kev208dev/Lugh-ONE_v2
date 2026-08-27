import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('장치 각도 입력', () => {
  for (const device of ['prism', 'mirror'] as const) {
    it(`${device} 각도는 마우스 휠로만 조절한다`, () => {
      const source = readFileSync(resolve(process.cwd(), `src/pages/${device}.ts`), 'utf8');
      const html = readFileSync(resolve(process.cwd(), `${device}.html`), 'utf8');

      expect(source).toContain("'wheel'");
      expect(source).not.toContain("'pointerdown'");
      expect(source).not.toContain("'pointermove'");
      expect(source).not.toContain("'pointerup'");
      expect(source).not.toContain("'pointercancel'");
      expect(html).toContain('마우스 휠만');
    });
  }
});
