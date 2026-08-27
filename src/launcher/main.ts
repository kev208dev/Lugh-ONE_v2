import { WindowManager } from '../runtime/WindowManager';
import { requestWindowManagementPermissionInBackground } from '../runtime/screenLayout';
import { LEVELS } from '../level/levels';
import { loadProgress, markSolved, resetProgress } from '../level/progression';
import { createMessageBus } from '../runtime/MessageBus';
import { ExperimentAudio } from '../audio/ExperimentAudio';
import { SolvedBanner } from '../rendering/SolvedBanner';
import { devicesForLevel, type PuzzleState } from '../level/types';
import { createOnboarding } from './onboarding';
import { startSolvedSequence, type SolvedSequence } from './solvedSequence';

const LAUNCH_TRANSITION_MS = 820;

const DEVICE_NAMES: Record<string, string> = {
  sun: '태양',
  mirror: '거울',
  blackhole: '블랙홀',
  prism: '프리즘',
  earth: '지구',
  mars: '화성'
};

const startBtnQ = document.querySelector<HTMLButtonElement>('#start-btn');
const statusElQ = document.querySelector<HTMLDivElement>('#status');
const errorPanelQ = document.querySelector<HTMLDivElement>('#error-panel');
const errorTitleQ = document.querySelector<HTMLDivElement>('#error-title');
const errorMessageElQ = document.querySelector<HTMLDivElement>('#error-message');
const retryBtnQ = document.querySelector<HTMLButtonElement>('#retry-btn');
const startBtnLabelQ = startBtnQ?.querySelector<HTMLSpanElement>('span');
const progressLabelQ = document.querySelector<HTMLSpanElement>('#progress-label');
const activeLevelNumberQ = document.querySelector<HTMLSpanElement>('#active-level-number');
const activeLevelHintQ = document.querySelector<HTMLParagraphElement>('#active-level-hint');
const activeLevelNameQ = document.querySelector<HTMLHeadingElement>('#active-level-name');
const activeLevelDescriptionQ = document.querySelector<HTMLParagraphElement>('#active-level-description');
const deviceListQ = document.querySelector<HTMLDivElement>('#device-list');
const goalSummaryQ = document.querySelector<HTMLParagraphElement>('#goal-summary');
const levelNavQ = document.querySelector<HTMLElement>('#level-nav');
const tutorialBtnQ = document.querySelector<HTMLButtonElement>('#tutorial-btn');
const restartFirstBtnQ = document.querySelector<HTMLButtonElement>('#restart-first-btn');
const onboardingRootQ = document.querySelector<HTMLElement>('#onboarding');

if (
  !startBtnQ ||
  !startBtnLabelQ ||
  !statusElQ ||
  !errorPanelQ ||
  !errorTitleQ ||
  !errorMessageElQ ||
  !retryBtnQ ||
  !progressLabelQ ||
  !activeLevelNumberQ ||
  !activeLevelHintQ ||
  !activeLevelNameQ ||
  !activeLevelDescriptionQ ||
  !deviceListQ ||
  !goalSummaryQ ||
  !levelNavQ ||
  !tutorialBtnQ ||
  !restartFirstBtnQ ||
  !onboardingRootQ
) {
  throw new Error('launcher: expected DOM elements missing from index.html');
}

// Rebind to non-null-typed consts. TS control-flow narrowing from the guard
// above does not persist into the nested closures below, but a fresh const
// assigned at this (already-narrowed) point carries the non-null type
// permanently, regardless of where it's later read from.
const startBtn: HTMLButtonElement = startBtnQ;
const statusEl: HTMLDivElement = statusElQ;
const errorPanel: HTMLDivElement = errorPanelQ;
const errorTitle: HTMLDivElement = errorTitleQ;
const errorMessageEl: HTMLDivElement = errorMessageElQ;
const retryBtn: HTMLButtonElement = retryBtnQ;
const startBtnLabel: HTMLSpanElement = startBtnLabelQ;
const progressLabel: HTMLSpanElement = progressLabelQ;
const activeLevelNumber: HTMLSpanElement = activeLevelNumberQ;
const activeLevelHint: HTMLParagraphElement = activeLevelHintQ;
const activeLevelName: HTMLHeadingElement = activeLevelNameQ;
const activeLevelDescription: HTMLParagraphElement = activeLevelDescriptionQ;
const deviceList: HTMLDivElement = deviceListQ;
const goalSummary: HTMLParagraphElement = goalSummaryQ;
const levelNav: HTMLElement = levelNavQ;
const tutorialBtn: HTMLButtonElement = tutorialBtnQ;
const restartFirstBtn: HTMLButtonElement = restartFirstBtnQ;
const onboardingRoot: HTMLElement = onboardingRootQ;

// One sessionId per page load, reused across retries within this load so
// popup names / future BroadcastChannel scoping stay stable across retries.
const sessionId = crypto.randomUUID();

const manager = new WindowManager();
const bus = createMessageBus(sessionId);
const solvedBanner = new SolvedBanner(document.body);
let progress = loadProgress();
const firstUnsolved = LEVELS.findIndex((level) => !progress.solvedLevelIds.includes(level.id));
let activeLevelIndex = firstUnsolved >= 0 ? firstUnsolved : LEVELS.length - 1;
let lastPuzzleState: PuzzleState = 'PLAYING';
let solvedSequence: SolvedSequence | undefined;
let audio: ExperimentAudio | undefined;

function experimentAudio(): ExperimentAudio {
  audio ??= new ExperimentAudio();
  return audio;
}

function unlockedThroughIndex(): number {
  if (progress.solvedLevelIds.length === 0) return 0;
  return Math.min(LEVELS.length - 1, progress.highestSolvedLevel + 1);
}

function deviceName(deviceId: string): string {
  if (deviceId.startsWith('nebula-')) return `성운 ${deviceId.slice('nebula-'.length)}`;
  return DEVICE_NAMES[deviceId] ?? deviceId;
}

function formatObjective(levelIndex: number): string {
  const goal = LEVELS[levelIndex].goal;
  const receiverGoals = goal.receivers.map((receiver) => {
    const range = receiver.maxPower === undefined
      ? `${receiver.minPower}% 이상`
      : `${receiver.minPower}~${receiver.maxPower}%`;
    return `${deviceName(receiver.receiverId)} ${range}`;
  });
  const holdSeconds = goal.holdDurationMs / 1000;
  return `${receiverGoals.join('  ·  ')}  ·  ${Number.isInteger(holdSeconds) ? holdSeconds : holdSeconds.toFixed(1)}초 유지`;
}

function clearSolvedSequence(): void {
  solvedSequence?.cancel();
  solvedSequence = undefined;
}

function selectLevel(index: number): void {
  if (index > unlockedThroughIndex() || index === activeLevelIndex) return;
  manager.closeAll();
  solvedBanner.hide();
  clearSolvedSequence();
  audio?.stabilizingStop();
  lastPuzzleState = 'PLAYING';
  activeLevelIndex = index;
  startBtnLabel.textContent = '실험 시작';
  setStatus(`${index + 1}단계를 선택했습니다`);
  renderLevelOverview();
}

function renderLevelOverview(): void {
  const level = LEVELS[activeLevelIndex];
  const solvedCount = LEVELS.filter((candidate) => progress.solvedLevelIds.includes(candidate.id)).length;

  progressLabel.textContent = `${solvedCount} / ${LEVELS.length} 완료`;
  activeLevelNumber.textContent = String(level.index + 1).padStart(2, '0');
  activeLevelHint.textContent = level.introHint ?? '빛의 경로를 만드세요';
  activeLevelName.textContent = level.name;
  activeLevelDescription.textContent = level.description ?? '';
  goalSummary.textContent = formatObjective(activeLevelIndex);

  deviceList.replaceChildren();
  for (const deviceId of devicesForLevel(level)) {
    const chip = document.createElement('span');
    chip.textContent = deviceName(deviceId);
    deviceList.append(chip);
  }

  levelNav.replaceChildren();
  const unlockedThrough = unlockedThroughIndex();
  LEVELS.forEach((candidate, index) => {
    const button = document.createElement('button');
    const number = document.createElement('span');
    const state = document.createElement('i');
    const solved = progress.solvedLevelIds.includes(candidate.id);
    const locked = index > unlockedThrough;

    button.type = 'button';
    button.className = 'launcher-level-step';
    button.classList.toggle('active', index === activeLevelIndex);
    button.classList.toggle('solved', solved);
    button.disabled = locked;
    button.setAttribute('aria-label', `${locked ? '잠긴' : '선택 가능한'} ${index + 1}단계: ${candidate.name}`);
    if (index === activeLevelIndex) button.setAttribute('aria-current', 'step');
    number.textContent = String(index + 1).padStart(2, '0');
    state.textContent = solved ? '완료' : locked ? '잠김' : '준비';
    button.append(number, state);
    button.addEventListener('click', () => selectLevel(index));
    levelNav.append(button);
  });
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

type AccessErrorOptions = {
  title?: string;
  actionLabel?: string;
  actionAvailable?: boolean;
};

function showError(message: string, options: AccessErrorOptions = {}): void {
  errorTitle.textContent = options.title ?? '창 열기 권한이 필요합니다';
  errorMessageEl.textContent = message;
  retryBtn.textContent = options.actionLabel ?? '권한 허용';
  retryBtn.hidden = options.actionAvailable === false;
  errorPanel.classList.add('visible');
  document.body.classList.add('access-required');
}

function hideError(): void {
  errorPanel.classList.remove('visible');
  errorMessageEl.textContent = '';
  retryBtn.hidden = false;
  document.body.classList.remove('access-required');
}

function setLaunchBusy(busy: boolean): void {
  startBtn.disabled = busy;
  retryBtn.disabled = busy;
  restartFirstBtn.disabled = busy;
  for (const button of [startBtn, retryBtn, restartFirstBtn]) {
    if (busy) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  }
}

function beginLaunchTransition(): number {
  document.body.classList.add('is-launching');
  setLaunchBusy(true);
  return performance.now();
}

async function finishLaunchTransition(startedAt: number): Promise<void> {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remaining = (reduceMotion ? 0 : LAUNCH_TRANSITION_MS) - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  }
  document.body.classList.remove('is-launching');
  setLaunchBusy(false);
}

async function showLaunchError(message: string, startedAt: number): Promise<void> {
  await finishLaunchTransition(startedAt);
  document.body.classList.remove('experiment-active');
  setStatus('');
  showError(message, { actionLabel: '다시 시도' });
  retryBtn.focus({ preventScroll: true });
}

function isChromiumFamily(): boolean {
  const uaData = (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } })
    .userAgentData;
  if (uaData?.brands?.length) {
    return uaData.brands.some((b) => /Chromium|Google Chrome/i.test(b.brand));
  }
  // Fallback for browsers without userAgentData: presence of window.chrome
  // plus a Chrome/Chromium UA token is a reasonable Chromium-family signal.
  return 'chrome' in window && /Chrome\//.test(navigator.userAgent);
}

function hasWindowManagementApi(): boolean {
  return typeof (window as unknown as { getScreenDetails?: unknown }).getScreenDetails === 'function';
}

function testPopupCapability(): boolean {
  const probe = window.open('', '_blank', 'width=1,height=1');
  if (!probe) {
    return false;
  }
  try {
    probe.close();
  } catch {
    // ignore
  }
  return true;
}

async function runLaunchFlow(options: { resetProgressOnSuccess?: boolean } = {}): Promise<void> {
  hideError();
  solvedBanner.hide();
  clearSolvedSequence();
  audio?.stabilizingStop();
  lastPuzzleState = 'PLAYING';
  // Defensive: a retry must never accumulate windows even if a previous
  // partial state somehow survived.
  manager.closeAll();

  setLaunchBusy(true);

  if (!isChromiumFamily()) {
    setLaunchBusy(false);
    showError('데스크톱용 크롬에서 이 실험을 열어 주세요.', {
      title: '데스크톱용 크롬이 필요합니다',
      actionAvailable: false
    });
    return;
  }

  setStatus('창 시스템을 확인하는 중입니다');

  if (hasWindowManagementApi()) {
    // Fire-and-forget: may prompt for permission, but this launch attempt
    // never awaits it (see screenLayout.computeWorkArea doc comment) — a
    // later RESTART can pick up the real multi-screen work area once granted.
    requestWindowManagementPermissionInBackground();
  }

  if (!testPopupCapability()) {
    setLaunchBusy(false);
    showError('이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.');
    retryBtn.focus({ preventScroll: true });
    return;
  }

  setStatus('빛을 조정하는 중입니다');
  const transitionStartedAt = beginLaunchTransition();

  const level = LEVELS[activeLevelIndex];
  const result = await manager.launchAll(sessionId, level);

  if (result.ok) {
    if (options.resetProgressOnSuccess) {
      progress = resetProgress();
      renderLevelOverview();
    }
    await finishLaunchTransition(transitionStartedAt);
    document.body.classList.add('experiment-active');
    setStatus('실험 창이 준비되었습니다');
    startBtnLabel.textContent = '실험 다시 시작';
  } else {
    await showLaunchError('창 열기 권한이 없습니다. 팝업을 허용한 뒤 다시 시도해 주세요.', transitionStartedAt);
  }
}

startBtn.addEventListener('click', () => {
  experimentAudio().hover();
  void runLaunchFlow();
});

retryBtn.addEventListener('click', () => {
  experimentAudio().hover();
  void runLaunchFlow();
});

restartFirstBtn.addEventListener('click', () => {
  experimentAudio().hover();
  activeLevelIndex = 0;
  startBtnLabel.textContent = '실험 시작';
  renderLevelOverview();
  void runLaunchFlow({ resetProgressOnSuccess: true });
});

let onboardingStorage: Storage | undefined;
try {
  onboardingStorage = window.localStorage;
} catch {
  // The tutorial still works when storage access is restricted.
}

const onboarding = createOnboarding(onboardingRoot, {
  storage: onboardingStorage,
  onComplete: () => {
    experimentAudio().hover();
    void runLaunchFlow();
  }
});

tutorialBtn.addEventListener('click', () => {
  experimentAudio().hover();
  onboarding.open();
});

if (onboarding.shouldOpenAutomatically()) {
  onboarding.open();
}

bus.subscribe((msg) => {
  if (
    msg.type !== 'puzzle-state' ||
    msg.levelId !== LEVELS[activeLevelIndex].id ||
    msg.state === lastPuzzleState
  ) return;

  if (msg.state === 'STABILIZING') {
    audio?.stabilizingStart();
  } else if (lastPuzzleState === 'STABILIZING') {
    audio?.stabilizingStop();
  }

  if (msg.state === 'SOLVED') {
    const level = LEVELS[activeLevelIndex];
    const solvedLevelIndex = activeLevelIndex;
    progress = markSolved(level.id, level.index);
    renderLevelOverview();
    audio?.solved();
    manager.closeAll();
    document.body.classList.remove('experiment-active');
    setLaunchBusy(false);
    try {
      window.focus();
    } catch {
      // Focus is a best effort; closing the device windows still exposes the launcher.
    }
    solvedBanner.showStable();
    setStatus('실험이 안정화되었습니다');
    clearSolvedSequence();
    solvedSequence = startSolvedSequence({
      currentLevelIndex: solvedLevelIndex,
      levelCount: LEVELS.length,
      onReveal: (nextLevelIndex, advance) => {
        solvedBanner.showSolved(
          level.index + 1,
          level.name,
          nextLevelIndex === null
            ? null
            : () => {
                experimentAudio().hover();
                advance();
              },
          () => {
            experimentAudio().hover();
            void runLaunchFlow();
          }
        );
      },
      onAdvance: (nextLevelIndex) => {
        if (activeLevelIndex !== solvedLevelIndex) return;
        activeLevelIndex = nextLevelIndex;
        renderLevelOverview();
        setStatus(`${nextLevelIndex + 1}단계를 시작합니다`);
        void runLaunchFlow();
      }
    });
  }

  lastPuzzleState = msg.state;
});

renderLevelOverview();
