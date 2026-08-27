import { afterEach, describe, expect, it } from 'vitest';
import { SolvedBanner } from '../src/rendering/SolvedBanner';

afterEach(() => {
  document.head.querySelectorAll('style').forEach((style) => style.remove());
  document.body.replaceChildren();
});

describe('SolvedBanner', () => {
  it('shows a large Korean completion screen with a reliable next-step action', () => {
    const banner = new SolvedBanner(document.body);
    banner.showSolved(1, '빛 분산', () => undefined, () => undefined);

    const root = document.querySelector<HTMLElement>('.exp-solved-banner');
    const style = document.head.querySelector('style')?.textContent ?? '';
    expect(root?.textContent).toContain('해결 완료');
    expect(root?.textContent).toContain('다음 단계 시작');
    expect(root?.textContent).toContain('다음 단계의 장치 창을 열려면');
    expect(style).toContain('inset: 0');
    expect(style).toContain('10000');
    expect(style).toContain('clamp(4rem, 12vw, 10rem)');
  });
});
