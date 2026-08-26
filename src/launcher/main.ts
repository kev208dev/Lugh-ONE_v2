import { WindowManager } from '../runtime/WindowManager';
import { requestWindowManagementPermissionInBackground } from '../runtime/screenLayout';

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

  setStatus('환경 확인 중...');

  if (!hasWindowManagementApi()) {
    setStatus('Window Management API 미지원 — 대체 레이아웃으로 진행합니다...');
  } else {
    // Fire-and-forget: may prompt for permission, but this launch attempt
    // never awaits it (see screenLayout.computeWorkArea doc comment) — a
    // later RESTART can pick up the real multi-screen work area once granted.
    requestWindowManagementPermissionInBackground();
  }

  setStatus('팝업 권한 확인 중...');
  if (!testPopupCapability()) {
    setStatus('');
    showError('팝업이 차단되어 있습니다. Chrome 팝업 차단을 해제한 뒤 다시 시도하세요.');
    startBtn.disabled = false;
    return;
  }

  setStatus('창을 여는 중... (WORLD, SUN, MIRROR, BLACKHOLE, PRISM, EARTH, MARS)');

  const result = await manager.launchAll(sessionId);

  if (result.ok) {
    setStatus('7개 창 실행됨 — WORLD, SUN, MIRROR, BLACKHOLE, PRISM, EARTH, MARS');
    startBtn.disabled = false;
    startBtn.textContent = 'RESTART';
  } else {
    setStatus('');
    showError(result.error);
    startBtn.disabled = false;
  }
}

startBtn.addEventListener('click', () => {
  void runLaunchFlow();
});

retryBtn.addEventListener('click', () => {
  void runLaunchFlow();
});
