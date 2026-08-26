import { WindowManager } from '../runtime/WindowManager';
import { requestWindowManagementPermissionInBackground } from '../runtime/screenLayout';
import { LauncherBackgroundDemo } from './backgroundDemo';
import { LEVELS } from '../level/levels';
import { loadProgress, markSolved } from '../level/progression';
import { createMessageBus } from '../runtime/MessageBus';
import { ExperimentAudio } from '../audio/ExperimentAudio';
import { SolvedBanner } from '../rendering/SolvedBanner';
import type { PuzzleState } from '../level/types';

// Decorative only — never allowed to block or fail the real launch flow, so
// it's wired up independently of the critical-element guard below.
const bgCanvas = document.querySelector<HTMLCanvasElement>('#bg-demo-canvas');
if (bgCanvas) {
  new LauncherBackgroundDemo(bgCanvas).start();
}

const startBtnQ = document.querySelector<HTMLButtonElement>('#start-btn');
const statusElQ = document.querySelector<HTMLDivElement>('#status');
const errorPanelQ = document.querySelector<HTMLDivElement>('#error-panel');
const errorMessageElQ = document.querySelector<HTMLDivElement>('#error-message');
const retryBtnQ = document.querySelector<HTMLButtonElement>('#retry-btn');

if (!startBtnQ || !statusElQ || !errorPanelQ || !errorMessageElQ || !retryBtnQ) {
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

// One sessionId per page load, reused across retries within this load so
// popup names / future BroadcastChannel scoping stay stable across retries.
const sessionId = crypto.randomUUID();

const manager = new WindowManager();
const bus = createMessageBus(sessionId);
const solvedBanner = new SolvedBanner(document.body);
const savedProgress = loadProgress();
const firstUnsolved = LEVELS.findIndex((level) => !savedProgress.solvedLevelIds.includes(level.id));
let activeLevelIndex = firstUnsolved >= 0 ? firstUnsolved : LEVELS.length - 1;
let lastPuzzleState: PuzzleState = 'PLAYING';
let solvedBannerTimer: ReturnType<typeof setTimeout> | undefined;
let audio: ExperimentAudio | undefined;

function experimentAudio(): ExperimentAudio {
  audio ??= new ExperimentAudio();
  return audio;
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showError(message: string): void {
  errorMessageEl.textContent = message;
  errorPanel.classList.add('visible');
}

function hideError(): void {
  errorPanel.classList.remove('visible');
  errorMessageEl.textContent = '';
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
    setStatus('');
    showError('이 실험은 Chrome(또는 Chromium 기반) 브라우저에서만 동작합니다.');
    startBtn.disabled = false;
    return;
  }

  setStatus('CALIBRATING...');

  if (hasWindowManagementApi()) {
    // Fire-and-forget: may prompt for permission, but this launch attempt
    // never awaits it (see screenLayout.computeWorkArea doc comment) — a
    // later RESTART can pick up the real multi-screen work area once granted.
    requestWindowManagementPermissionInBackground();
  }

  setStatus('CHECKING WINDOW ACCESS...');
  if (!testPopupCapability()) {
    setStatus('');
    showError('팝업이 차단되어 있습니다. Chrome 팝업 차단을 해제한 뒤 다시 시도하세요.');
    startBtn.disabled = false;
    return;
  }

  setStatus('OPENING INSTRUMENTS...');

  const level = LEVELS[activeLevelIndex];
  const result = await manager.launchAll(sessionId, level);

  if (result.ok) {
    setStatus(`${String(level.index + 1).padStart(2, '0')} · ${level.name.toUpperCase()} — EXPERIMENT READY`);
    startBtn.disabled = false;
    startBtn.textContent = 'RESTART EXPERIMENT';
  } else {
    setStatus('');
    showError(result.error);
    startBtn.disabled = false;
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

bus.subscribe((msg) => {
  if (msg.type !== 'puzzle-state' || msg.state === lastPuzzleState) return;

  if (msg.state === 'STABILIZING') {
    audio?.stabilizingStart();
  } else if (lastPuzzleState === 'STABILIZING') {
    audio?.stabilizingStop();
  }

  if (msg.state === 'SOLVED') {
    const level = LEVELS[activeLevelIndex];
    markSolved(level.id, level.index);
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
