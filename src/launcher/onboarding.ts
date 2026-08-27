export type TutorialStep = {
  eyebrow: string;
  title: string;
  description: string;
  lesson: string;
};

export const ONBOARDING_STORAGE_KEY = 'lugh-one:onboarding-v3';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    eyebrow: '핵심 규칙 01',
    title: '태양과 프리즘 창을 움직이세요',
    description:
      '처음에는 태양 창과 프리즘 창만 움직이면 됩니다. 지구와 화성 창은 빛을 받아야 하는 목표 지점이므로 원래 위치에 그대로 두세요.',
    lesson: '태양과 프리즘의 위치를 바꾸어 빛이 프리즘을 통과한 뒤 행성으로 향하게 만드세요.'
  },
  {
    eyebrow: '핵심 규칙 02',
    title: '흰빛을 프리즘에 정확히 넣으세요',
    description:
      '태양에서 나온 흰빛이 프리즘의 삼각형에 닿아야 여러 색으로 갈라집니다. 빛이 창을 스치기만 하면 분광되지 않습니다.',
    lesson: '태양 창과 프리즘 창을 먼저 옮겨 흰빛이 삼각형을 관통하도록 맞추세요.'
  },
  {
    eyebrow: '핵심 규칙 03',
    title: '프리즘의 각도를 조절하세요',
    description:
      '프리즘이나 거울 창 위에서 마우스 휠을 돌리면 장치의 각도가 바뀝니다. 드래그는 각도 조절에 사용하지 않습니다.',
    lesson: '창의 위치로 큰 경로를 만들고, 마우스 휠로 마지막 방향을 미세 조정하세요.'
  },
  {
    eyebrow: '핵심 규칙 04',
    title: '행성의 목표 수치를 유지하세요',
    description:
      '지구와 화성 창에 표시된 빛의 양을 단계 목표에 맞추세요. 목표가 둘이라면 두 행성의 조건을 동시에 만족해야 합니다.',
    lesson: '목표 수치를 약 1.5초 동안 유지하면 단계가 해결됩니다.'
  },
  {
    eyebrow: '실험 준비 완료',
    title: '성공 화면에서 다음 단계를 시작하세요',
    description:
      '단계를 해결하면 장치 창이 닫히고 큰 성공 화면이 나타납니다. 다음 단계 시작 버튼을 누르면 새 장치 창이 안전하게 열립니다.',
    lesson: '막히면 R 키로 현재 단계를 초기화할 수 있습니다.'
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
  if (!element) throw new Error(`게임 안내에 필요한 요소가 없습니다: ${selector}`);
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
      // 저장소를 쓸 수 없어도 게임 안내와 실험은 계속 진행한다.
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
