import { WindowManager } from '../runtime/WindowManager';
import { requestWindowManagementPermissionInBackground } from '../runtime/screenLayout';
import { LEVELS } from '../level/levels';
import { loadProgress, markSolved } from '../level/progression';
import { createMessageBus } from '../runtime/MessageBus';
import { ExperimentAudio } from '../audio/ExperimentAudio';
import { SolvedBanner } from '../rendering/SolvedBanner';
import { devicesForLevel, type PuzzleState } from '../level/types';
import { createOnboarding } from './onboarding';

const LAUNCH_TRANSITION_MS = 820;

const startBtnQ = document.querySelector<HTMLButtonElement>('#start-btn');
const statusElQ = document.querySelector<HTMLDivElement>('#status');
const errorPanelQ = document.querySelector<HTMLDivElement>('#error-panel');
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
const onboardingRootQ = document.querySelector<HTMLElement>('#onboarding');

if (
  !startBtnQ ||
  !startBtnLabelQ ||
  !statusElQ ||
  !errorPanelQ ||
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
let solvedBannerTimer: ReturnType<typeof setTimeout> | undefined;
let audio: ExperimentAudio | undefined;

function experimentAudio(): ExperimentAudio {
  audio ??= new ExperimentAudio();
  return audio;
}

function unlockedThroughIndex(): number {
  if (progress.solvedLevelIds.length === 0) return 0;
  return Math.min(LEVELS.length - 1, progress.highestSolvedLevel + 1);
}

function formatObjective(levelIndex: number): string {
  const goal = LEVELS[levelIndex].goal;
  const receiverGoals = goal.receivers.map((receiver) => {
    const maximum = receiver.maxPower === undefined ? '' : `–${receiver.maxPower}%`;
    return `${receiver.receiverId.toUpperCase()} ${receiver.minPower}%${maximum}`;
  });
  const holdSeconds = goal.holdDurationMs / 1000;
  return `${receiverGoals.join('  ·  ')}  ·  HOLD ${Number.isInteger(holdSeconds) ? holdSeconds : holdSeconds.toFixed(1)}s`;
}

function selectLevel(index: number): void {
  if (index > unlockedThroughIndex() || index === activeLevelIndex) return;
  manager.closeAll();
  solvedBanner.hide();
  if (solvedBannerTimer !== undefined) clearTimeout(solvedBannerTimer);
  solvedBannerTimer = undefined;
  audio?.stabilizingStop();
  lastPuzzleState = 'PLAYING';
  activeLevelIndex = index;
  startBtnLabel.textContent = 'BEGIN EXPERIMENT';
  setStatus(`EXPERIMENT ${String(index + 1).padStart(2, '0')} SELECTED`);
  renderLevelOverview();
}

function renderLevelOverview(): void {
  const level = LEVELS[activeLevelIndex];
  const solvedCount = LEVELS.filter((candidate) => progress.solvedLevelIds.includes(candidate.id)).length;

  progressLabel.textContent = `${solvedCount} / ${LEVELS.length} STABLE`;
  activeLevelNumber.textContent = String(level.index + 1).padStart(2, '0');
  activeLevelHint.textContent = (level.introHint ?? 'SHAPE THE LIGHT').toUpperCase();
  activeLevelName.textContent = level.name;
  activeLevelDescription.textContent = level.description ?? '';
  goalSummary.textContent = formatObjective(activeLevelIndex);

  deviceList.replaceChildren();
  for (const deviceId of devicesForLevel(level)) {
    const chip = document.createElement('span');
    chip.textContent = deviceId.toUpperCase();
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
    button.setAttribute('aria-label', `${locked ? 'Locked' : 'Select'} experiment ${index + 1}: ${candidate.name}`);
    if (index === activeLevelIndex) button.setAttribute('aria-current', 'step');
    number.textContent = String(index + 1).padStart(2, '0');
    state.textContent = solved ? 'STABLE' : locked ? 'LOCKED' : 'READY';
    button.append(number, state);
    button.addEventListener('click', () => selectLevel(index));
    levelNav.append(button);
  });
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showError(message: string): void {
  errorMessageEl.textContent = message;
  errorPanel.classList.add('visible');
  document.body.classList.add('access-required');
}

function hideError(): void {
  errorPanel.classList.remove('visible');
  errorMessageEl.textContent = '';
  document.body.classList.remove('access-required');
}

function beginLaunchTransition(): number {
  document.body.classList.add('is-launching');
  startBtn.setAttribute('aria-busy', 'true');
  return performance.now();
}

async function finishLaunchTransition(startedAt: number): Promise<void> {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remaining = (reduceMotion ? 0 : LAUNCH_TRANSITION_MS) - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  }
  document.body.classList.remove('is-launching');
  startBtn.removeAttribute('aria-busy');
}

async function showLaunchError(message: string, startedAt: number): Promise<void> {
  await finishLaunchTransition(startedAt);
  document.body.classList.remove('experiment-active');
  setStatus('');
  showError(message);
  startBtn.disabled = false;
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

async function runLaunchFlow(): Promise<void> {
  hideError();
  const transitionStartedAt = beginLaunchTransition();
  solvedBanner.hide();
  if (solvedBannerTimer !== undefined) clearTimeout(solvedBannerTimer);
  solvedBannerTimer = undefined;
  audio?.stabilizingStop();
  lastPuzzleState = 'PLAYING';
  // Defensive: a retry must never accumulate windows even if a previous
  // partial state somehow survived.
  manager.closeAll();

  startBtn.disabled = true;

  if (!isChromiumFamily()) {
    await showLaunchError('This experiment requires Chrome on desktop.', transitionStartedAt);
    return;
  }

  setStatus('WINDOW SYSTEM · CHECKING');

  if (hasWindowManagementApi()) {
    // Fire-and-forget: may prompt for permission, but this launch attempt
    // never awaits it (see screenLayout.computeWorkArea doc comment) — a
    // later RESTART can pick up the real multi-screen work area once granted.
    requestWindowManagementPermissionInBackground();
  }

  if (!testPopupCapability()) {
    await showLaunchError('Allow pop-ups for this site, then try again.', transitionStartedAt);
    return;
  }

  setStatus('CALIBRATING LIGHT');

  const level = LEVELS[activeLevelIndex];
  const result = await manager.launchAll(sessionId, level);

  if (result.ok) {
    await finishLaunchTransition(transitionStartedAt);
    document.body.classList.add('experiment-active');
    setStatus('WINDOW SYSTEM · READY');
    startBtn.disabled = false;
    startBtnLabel.textContent = 'RESTART EXPERIMENT';
  } else {
    await showLaunchError('Window access was not granted. Allow pop-ups, then try again.', transitionStartedAt);
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

bus.subscribe((msg) => {
  if (msg.type !== 'puzzle-state' || msg.state === lastPuzzleState) return;

  if (msg.state === 'STABILIZING') {
    audio?.stabilizingStart();
  } else if (lastPuzzleState === 'STABILIZING') {
    audio?.stabilizingStop();
  }

  if (msg.state === 'SOLVED') {
    const level = LEVELS[activeLevelIndex];
    progress = markSolved(level.id, level.index);
    renderLevelOverview();
    audio?.solved();
    solvedBanner.showStable();
    setStatus('EXPERIMENT STABLE');
    solvedBannerTimer = setTimeout(() => {
      solvedBanner.showSolved(
        level.index + 1,
        level.name,
        () => {
          experimentAudio().hover();
          activeLevelIndex = (activeLevelIndex + 1) % LEVELS.length;
          renderLevelOverview();
          void runLaunchFlow();
        },
        () => {
          experimentAudio().hover();
          void runLaunchFlow();
        }
      );
    }, 1700);
  }

  lastPuzzleState = msg.state;
});

renderLevelOverview();
