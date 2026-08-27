import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createOnboarding,
  ONBOARDING_STORAGE_KEY,
  TUTORIAL_STEPS
} from '../src/launcher/onboarding';

const launcherHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function mountOnboarding(): HTMLElement {
  const parsed = new DOMParser().parseFromString(launcherHtml, 'text/html');
  const markup = parsed.querySelector<HTMLElement>('#onboarding');
  if (!markup) throw new Error('테스트용 게임 안내 화면이 없습니다');
  document.body.innerHTML = markup.outerHTML;
  const mounted = document.querySelector<HTMLElement>('#onboarding');
  if (!mounted) throw new Error('테스트용 게임 안내 화면을 만들지 못했습니다');
  return mounted;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.className = '';
  document.body.replaceChildren();
});

describe('런처 게임 안내', () => {
  it('태양과 프리즘 창을 움직이는 전체 게임 흐름을 다섯 단계로 설명한다', () => {
    const tutorialCopy = TUTORIAL_STEPS.map((step) => Object.values(step).join(' ')).join(' ');

    expect(TUTORIAL_STEPS).toHaveLength(5);
    expect(tutorialCopy).toContain('태양 창과 프리즘 창만 움직이면 됩니다');
    expect(tutorialCopy).toContain('지구와 화성 창은 빛을 받아야 하는 목표 지점');
    expect(tutorialCopy).toContain('1.5초');
    expect(tutorialCopy).toContain('R 키');
    expect(tutorialCopy).toContain('다음 단계 시작 버튼');
  });

  it('안내를 진행하고 완료 상태를 저장한 뒤 첫 실험을 시작한다', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const onComplete = vi.fn();
    const root = mountOnboarding();
    const onboarding = createOnboarding(root, { storage, onComplete });
    const next = root.querySelector<HTMLButtonElement>('#onboarding-next');
    if (!next) throw new Error('다음 버튼이 없습니다');

    expect(onboarding.shouldOpenAutomatically()).toBe(true);
    onboarding.open();
    expect(root.hidden).toBe(false);
    expect(document.body.classList.contains('onboarding-open')).toBe(true);
    expect(root.querySelector('#onboarding-title')?.textContent).toContain('태양과 프리즘');

    for (let step = 1; step < TUTORIAL_STEPS.length; step += 1) next.click();
    expect(root.querySelector('#onboarding-title')?.textContent).toContain('성공 화면');
    expect(next.textContent).toContain('첫 실험 시작');

    next.click();
    expect(root.hidden).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(values.get(ONBOARDING_STORAGE_KEY)).toBe('seen');
    expect(onboarding.shouldOpenAutomatically()).toBe(false);
  });
});
