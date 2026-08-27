export type TutorialStep = {
  eyebrow: string;
  title: string;
  description: string;
  lesson: string;
};

export const ONBOARDING_STORAGE_KEY = 'lugh-one:onboarding-v1';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    eyebrow: '핵심 규칙 01',
    title: '당신의 데스크톱이 퍼즐판입니다',
    description:
      '각 팝업 창은 SUN, MIRROR, PRISM, 행성 같은 하나의 광학 장치입니다. 창을 옮기면 빛의 실제 경로도 즉시 따라 움직입니다.',
    lesson: '창을 보는 게임이 아니라, 창 자체를 움직여 푸는 게임입니다.'
  },
  {
    eyebrow: '핵심 규칙 02',
    title: '빛의 사슬을 끊김 없이 연결하세요',
    description:
      'SUN의 백색광을 MIRROR 또는 BLACK HOLE로 꺾어 PRISM까지 전달하세요. 빛이 다음 장치의 창에 닿지 않으면 광학 체인이 끊깁니다.',
    lesson: 'SUN → 경로 장치 → PRISM → EARTH / MARS 순서로 창을 배치하세요.'
  },
  {
    eyebrow: '핵심 규칙 03',
    title: '프리즘에 닿아야 무지개가 됩니다',
    description:
      '백색광은 PRISM 창을 그냥 통과하지 않습니다. 빛이 프리즘 삼각형에 정확히 닿는 순간 여러 색으로 분리되어 나갑니다.',
    lesson: 'PRISM 창을 옮기고, 창 안에서 드래그하거나 휠을 돌려 분광 각도를 조절하세요.'
  },
  {
    eyebrow: '핵심 규칙 04',
    title: '무지개를 두 행성에 나눠 주세요',
    description:
      'PRISM에서 나온 실제 색 띠를 행성에 비추세요. EARTH는 청록 계열, MARS는 주황·적색 계열의 에너지를 더 잘 받습니다.',
    lesson: '두 행성의 목표 퍼센트를 동시에 맞춘 뒤 약 1.5초 동안 유지하면 안정화됩니다.'
  },
  {
    eyebrow: '실험 준비 완료',
    title: '이제 첫 번째 빛을 연결하세요',
    description:
      'Chrome의 팝업을 허용하고 열린 장치 창을 모두 유지하세요. 후반의 성운은 닿은 빛을 전부 흡수하므로 우회 경로를 만들어야 합니다.',
    lesson: '성운은 움직일 수 없는 벽입니다. 막히면 R로 레벨을 초기화하세요.'
  }
] as const;

type OnboardingOptions = {
  onComplete: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
};

export type OnboardingController = {
  open: () => void;
  close: () => void;
  shouldOpenAutomatically: () => boolean;
};

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`onboarding: expected ${selector} in index.html`);
  return element;
}

export function createOnboarding(
  root: HTMLElement,
  { onComplete, storage }: OnboardingOptions
): OnboardingController {
  const stepLabel = requiredElement<HTMLElement>(root, '#onboarding-step-label');
  const progress = requiredElement<HTMLElement>(root, '#onboarding-progress');
  const visual = requiredElement<HTMLElement>(root, '#onboarding-visual');
  const eyebrow = requiredElement<HTMLElement>(root, '#onboarding-eyebrow');
  const title = requiredElement<HTMLElement>(root, '#onboarding-title');
  const description = requiredElement<HTMLElement>(root, '#onboarding-description');
  const lesson = requiredElement<HTMLElement>(root, '#onboarding-lesson');
  const skipButton = requiredElement<HTMLButtonElement>(root, '#onboarding-skip');
  const previousButton = requiredElement<HTMLButtonElement>(root, '#onboarding-prev');
  const nextButton = requiredElement<HTMLButtonElement>(root, '#onboarding-next');

  let activeStep = 0;
  let returnFocus: HTMLElement | null = null;

  const progressSegments = TUTORIAL_STEPS.map(() => document.createElement('span'));
  progress.replaceChildren(...progressSegments);

  function rememberCompletion(): void {
    try {
      storage?.setItem(ONBOARDING_STORAGE_KEY, 'seen');
    } catch {
      // Storage may be unavailable in private or restricted browsing modes.
    }
  }

  function render(): void {
    const step = TUTORIAL_STEPS[activeStep];
    const isLastStep = activeStep === TUTORIAL_STEPS.length - 1;

    stepLabel.textContent = `${String(activeStep + 1).padStart(2, '0')} / ${String(TUTORIAL_STEPS.length).padStart(2, '0')}`;
    eyebrow.textContent = step.eyebrow;
    title.textContent = step.title;
    description.textContent = step.description;
    lesson.textContent = step.lesson;
    visual.dataset.step = String(activeStep);
    progress.setAttribute('aria-valuenow', String(activeStep + 1));
    progressSegments.forEach((segment, index) => segment.classList.toggle('active', index <= activeStep));
    previousButton.disabled = activeStep === 0;
    nextButton.innerHTML = isLastStep
      ? '첫 실험 시작 <span aria-hidden="true">→</span>'
      : '다음 <span aria-hidden="true">→</span>';
  }

  function close(): void {
    if (root.hidden) return;
    rememberCompletion();
    root.hidden = true;
    document.body.classList.remove('onboarding-open');
    returnFocus?.focus();
    returnFocus = null;
  }

  function open(): void {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeStep = 0;
    render();
    root.hidden = false;
    document.body.classList.add('onboarding-open');
    requestAnimationFrame(() => nextButton.focus());
  }

  function shouldOpenAutomatically(): boolean {
    try {
      return storage?.getItem(ONBOARDING_STORAGE_KEY) !== 'seen';
    } catch {
      return true;
    }
  }

  previousButton.addEventListener('click', () => {
    if (activeStep === 0) return;
    activeStep -= 1;
    render();
  });

  nextButton.addEventListener('click', () => {
    if (activeStep < TUTORIAL_STEPS.length - 1) {
      activeStep += 1;
      render();
      return;
    }

    close();
    onComplete();
  });

  skipButton.addEventListener('click', close);

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  render();
  return { open, close, shouldOpenAutomatically };
}
