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
  if (!markup) throw new Error('test fixture: onboarding missing');
  document.body.innerHTML = markup.outerHTML;
  const mounted = document.querySelector<HTMLElement>('#onboarding');
  if (!mounted) throw new Error('test fixture: onboarding mount failed');
  return mounted;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.className = '';
  document.body.replaceChildren();
});

describe('launcher onboarding', () => {
  it('teaches the complete desktop-to-planets gameplay loop in five steps', () => {
    const tutorialCopy = TUTORIAL_STEPS.map((step) => Object.values(step).join(' ')).join(' ');

    expect(TUTORIAL_STEPS).toHaveLength(5);
    expect(tutorialCopy).toContain('데스크톱');
    expect(tutorialCopy).toContain('SUN');
    expect(tutorialCopy).toContain('PRISM');
    expect(tutorialCopy).toContain('EARTH');
    expect(tutorialCopy).toContain('MARS');
    expect(tutorialCopy).toContain('1.5초');
    expect(tutorialCopy).toContain('R로');
  });

  it('advances, persists completion, and starts the experiment from the final step', () => {
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
    if (!next) throw new Error('test fixture: next button missing');

    expect(onboarding.shouldOpenAutomatically()).toBe(true);
    onboarding.open();
    expect(root.hidden).toBe(false);
    expect(document.body.classList.contains('onboarding-open')).toBe(true);
    expect(root.querySelector('#onboarding-title')?.textContent).toContain('데스크톱');

    for (let step = 1; step < TUTORIAL_STEPS.length; step += 1) next.click();
    expect(root.querySelector('#onboarding-title')?.textContent).toContain('첫 번째 빛');
    expect(next.textContent).toContain('첫 실험 시작');

    next.click();
    expect(root.hidden).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(values.get(ONBOARDING_STORAGE_KEY)).toBe('seen');
    expect(onboarding.shouldOpenAutomatically()).toBe(false);
  });
});
