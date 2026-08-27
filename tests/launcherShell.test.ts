import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const launcherHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const appCss = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

type ParsedRule = {
  selectors: string[];
  declarations: Map<string, string>;
};

function parseRules(css: string): ParsedRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: ParsedRule[] = [];

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean);
    const declarations = new Map<string, string>();

    for (const declaration of match[2].split(';')) {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex < 0) continue;
      declarations.set(
        declaration.slice(0, colonIndex).trim(),
        declaration.slice(colonIndex + 1).trim()
      );
    }

    rules.push({ selectors, declarations });
  }

  return rules;
}

function declarationFor(rules: ParsedRule[], selector: string, property: string): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (rule.selectors.includes(selector) && rule.declarations.has(property)) {
      value = rule.declarations.get(property);
    }
  }
  return value;
}

describe('launcher shell', () => {
  it('ships the title, primary launch action, and active-mission UI in index.html', () => {
    const doc = new DOMParser().parseFromString(launcherHtml, 'text/html');
    const title = doc.querySelector<HTMLHeadingElement>('#launcher-title');
    const startButton = doc.querySelector<HTMLButtonElement>('#start-btn');
    const mission = doc.querySelector<HTMLElement>('.launcher-mission');

    expect(doc.body.classList.contains('launcher-page')).toBe(true);
    expect(title?.textContent?.replace(/\s/g, '')).toBe('Lugh:ONE');
    expect(startButton?.type).toBe('button');
    expect(startButton?.textContent).toContain('실험 시작');

    expect(mission).not.toBeNull();
    expect(mission?.querySelector('#active-level-number')?.textContent?.trim()).toBe('01');
    expect(mission?.querySelector('#active-level-name')?.textContent?.trim()).toBe('빛 분산');
    expect(mission?.querySelector('#active-level-description')).not.toBeNull();
    expect(mission?.querySelector('#device-list')).not.toBeNull();
    expect(mission?.querySelector('#goal-summary')).not.toBeNull();
    expect(mission?.querySelector('#level-nav')).not.toBeNull();

    expect(doc.querySelector('link[href="/src/style.css"]')).not.toBeNull();
    expect(doc.querySelector('script[src="/src/launcher/main.ts"]')).not.toBeNull();
  });

  it('keeps the field guide available after launch without adding a second primary CTA', () => {
    const doc = new DOMParser().parseFromString(launcherHtml, 'text/html');
    const tutorialButton = doc.querySelector<HTMLButtonElement>('#tutorial-btn');
    const onboarding = doc.querySelector<HTMLElement>('#onboarding');

    expect(tutorialButton?.type).toBe('button');
    expect(tutorialButton?.textContent).toContain('게임 안내 다시 보기');
    expect(tutorialButton?.closest('.launcher-mission')).not.toBeNull();
    expect(onboarding?.hidden).toBe(true);
    expect(onboarding?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(onboarding?.querySelector('#onboarding-progress')?.getAttribute('aria-valuemax')).toBe('5');
    expect(onboarding?.querySelector('#onboarding-prev')).not.toBeNull();
    expect(onboarding?.querySelector('#onboarding-next')).not.toBeNull();
    expect(onboarding?.querySelector('.tutorial-sun')).not.toBeNull();
    expect(onboarding?.querySelector('.tutorial-prism')).not.toBeNull();
    expect(onboarding?.querySelector('.tutorial-earth')).not.toBeNull();
    expect(onboarding?.querySelector('.tutorial-mars')).not.toBeNull();
  });

  it('uses a static optical motif and keeps the initial composition minimal', () => {
    const doc = new DOMParser().parseFromString(launcherHtml, 'text/html');
    const optic = doc.querySelector<HTMLElement>('.launcher-optic');
    const hero = doc.querySelector<HTMLElement>('.launcher-hero');
    const idleButtons = [...(hero?.querySelectorAll('button') ?? [])].filter(
      (button) => !button.closest('.launcher-access-panel')
    );

    expect(optic?.querySelector('svg')).not.toBeNull();
    expect(doc.querySelector('#bg-demo-canvas')).toBeNull();
    expect(idleButtons).toHaveLength(1);
    expect(hero?.querySelector('#start-btn')?.textContent).toContain('실험 시작');
    expect(doc.querySelector('.launcher-intro')).toBeNull();
    expect(doc.querySelector('.launcher-online')).toBeNull();
  });

  it('keeps generic overlay stacking rules from pulling launcher layers into normal flow', () => {
    const doc = new DOMParser().parseFromString(launcherHtml, 'text/html');
    const rules = parseRules(appCss);
    const launcherLayers = [
      '.launcher-bg-canvas',
      '.launcher-grain',
      '.launcher-vignette',
      '.launcher-content'
    ].map((selector) => {
      const element = doc.querySelector(selector);
      expect(element, `${selector} must exist in index.html`).not.toBeNull();
      return element as Element;
    });

    const unsafeSelectors = rules.flatMap((rule) => {
      const resetsFlow = rule.declarations.get('position') === 'relative';
      const isGenericOverlayRule = rule.selectors.some((selector) =>
        selector.includes(':not(.overlay-canvas)')
      );
      if (!resetsFlow || !isGenericOverlayRule) return [];

      return rule.selectors.filter((selector) =>
        launcherLayers.some((element) => element.matches(selector))
      );
    });

    expect(unsafeSelectors).toEqual([]);
    expect(declarationFor(rules, '.launcher-bg-canvas', 'position')).toBe('fixed');
    expect(declarationFor(rules, '.launcher-grain', 'position')).toBe('fixed');
    expect(declarationFor(rules, '.launcher-vignette', 'position')).toBe('fixed');
    expect(declarationFor(rules, '.launcher-content', 'z-index')).toBe('3');
  });

  it('keeps launcher copy readable and the footer out of the viewport overlay stack', () => {
    const rules = parseRules(appCss);

    expect(declarationFor(rules, '.launcher-footer', 'position')).toBe('relative');
    expect(Number(declarationFor(rules, '.launcher-title', 'line-height'))).toBeGreaterThanOrEqual(0.9);
    expect(declarationFor(rules, '.launcher-actions', 'flex-direction')).toBe('column');
    expect(declarationFor(rules, '.onboarding[hidden]', 'display')).toBe('none');
    expect(appCss).toContain('@media (max-width: 1100px)');
  });

  it('prominently explains that the player moves the sun and prism windows', () => {
    const doc = new DOMParser().parseFromString(launcherHtml, 'text/html');
    const note = doc.querySelector<HTMLElement>('.launcher-control-note');
    const howTo = doc.querySelector<HTMLDetailsElement>('.launcher-howto');

    expect(note?.textContent).toContain('태양 창과 프리즘 창만 움직이세요');
    expect(note?.textContent).toContain('지구와 화성 창은 목표 지점');
    expect(howTo?.open).toBe(true);
  });
});
