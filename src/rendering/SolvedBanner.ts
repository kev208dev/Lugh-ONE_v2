/**
 * Full-screen two-stage completion overlay. It deliberately keeps the next
 * action inside the launcher so its click carries the user activation Chrome
 * requires to open the next experiment's popup windows.
 *
 * Styling is injected once via a scoped <style> tag (all class names
 * prefixed `exp-solved-banner`) rather than via src/style.css, so this can
 * be dropped into any device page's DOM without a stylesheet dependency.
 */
export class SolvedBanner {
  private readonly root: HTMLDivElement;
  private readonly stableEl: HTMLDivElement;
  private readonly levelEl: HTMLDivElement;
  private readonly solvedEl: HTMLDivElement;
  private readonly guideEl: HTMLParagraphElement;
  private readonly actionsEl: HTMLDivElement;

  private static styleInjected = false;

  constructor(container: HTMLElement) {
    SolvedBanner.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'exp-solved-banner';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '단계 해결 완료');

    this.stableEl = document.createElement('div');
    this.stableEl.className = 'exp-solved-banner__stable';
    this.stableEl.textContent = '신호 안정화 완료';

    this.levelEl = document.createElement('div');
    this.levelEl.className = 'exp-solved-banner__level';

    this.solvedEl = document.createElement('div');
    this.solvedEl.className = 'exp-solved-banner__solved';
    this.solvedEl.textContent = '해결 완료';

    this.guideEl = document.createElement('p');
    this.guideEl.className = 'exp-solved-banner__guide';

    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'exp-solved-banner__actions';

    this.root.append(this.stableEl, this.levelEl, this.solvedEl, this.guideEl, this.actionsEl);
    container.appendChild(this.root);
  }

  private static injectStyles(): void {
    if (SolvedBanner.styleInjected) return;
    SolvedBanner.styleInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      .exp-solved-banner {
        position: fixed;
        inset: 0;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(0.7rem, 2vh, 1.5rem);
        width: 100%;
        min-height: 100%;
        padding: clamp(2rem, 6vw, 6rem);
        box-sizing: border-box;
        background:
          radial-gradient(circle at 50% 45%, rgba(51, 104, 170, 0.3), transparent 34rem),
          rgba(4, 7, 12, 0.96);
        backdrop-filter: blur(18px);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #f2f6ff;
        text-align: center;
        opacity: 0;
        transition: opacity 0.35s ease;
        pointer-events: auto;
        z-index: 10000;
      }
      .exp-solved-banner.exp-solved-banner--visible {
        display: flex;
        opacity: 1;
      }
      .exp-solved-banner__stable {
        font-size: clamp(1.3rem, 3vw, 2.4rem);
        font-weight: 500;
        letter-spacing: 0.08em;
        color: rgba(226, 238, 255, 0.86);
      }
      .exp-solved-banner__level {
        display: none;
        font-size: clamp(0.9rem, 1.5vw, 1.2rem);
        font-weight: 500;
        color: rgba(226, 238, 255, 0.62);
      }
      .exp-solved-banner__solved {
        display: none;
        font-size: clamp(4rem, 12vw, 10rem);
        line-height: 0.95;
        font-weight: 720;
        letter-spacing: -0.04em;
        color: #dcecff;
        text-shadow: 0 0 4rem rgba(127, 184, 255, 0.28);
      }
      .exp-solved-banner__guide {
        display: none;
        max-width: 34rem;
        margin: 0;
        color: rgba(226, 238, 255, 0.68);
        font-size: clamp(0.9rem, 1.4vw, 1.05rem);
        line-height: 1.7;
      }
      .exp-solved-banner__actions {
        display: none;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.8rem;
        margin-top: 0.7rem;
        pointer-events: auto;
      }
      .exp-solved-banner__btn {
        min-width: 11rem;
        background: rgba(127, 184, 255, 0.09);
        border: 1px solid rgba(127, 184, 255, 0.58);
        color: #e8ecf4;
        font-family: inherit;
        font-size: 0.92rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        padding: 0.9rem 1.3rem;
        border-radius: 0.3rem;
        cursor: pointer;
      }
      .exp-solved-banner__btn:hover {
        background: rgba(127, 184, 255, 0.2);
        border-color: rgba(190, 220, 255, 0.9);
      }
    `;
    document.head.appendChild(style);
  }

  /** Stage 1: shows just "EXPERIMENT STABLE". */
  showStable(): void {
    this.root.classList.add('exp-solved-banner--visible');
    this.stableEl.style.display = 'block';
    this.levelEl.style.display = 'none';
    this.solvedEl.style.display = 'none';
    this.guideEl.style.display = 'none';
    this.actionsEl.style.display = 'none';
    this.actionsEl.replaceChildren();
  }

  /** Stage 2: replaces stage 1 with the level name + "SOLVED" and a small
   * next/replay affordance. `levelIndex` is 1-based and rendered zero-padded
   * (e.g. 1 -> "01"). */
  showSolved(levelIndex: number, levelName: string, onNext: (() => void) | null, onReplay: () => void): void {
    this.root.classList.add('exp-solved-banner--visible');
    this.stableEl.style.display = 'none';

    this.levelEl.style.display = 'block';
    this.levelEl.textContent = `${levelIndex}단계 · ${levelName}`;

    this.solvedEl.style.display = 'block';

    this.guideEl.style.display = 'block';
    this.guideEl.textContent = onNext
      ? '다음 단계의 장치 창을 열려면 아래 버튼을 눌러 주세요.'
      : '모든 실험을 완료했습니다.';

    this.actionsEl.style.display = 'flex';
    this.actionsEl.replaceChildren();

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'exp-solved-banner__btn';
    replayBtn.textContent = '이 단계 다시 하기';
    replayBtn.addEventListener('click', onReplay);

    if (onNext) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'exp-solved-banner__btn';
      nextBtn.textContent = '다음 단계 시작';
      nextBtn.addEventListener('click', onNext);
      this.actionsEl.append(nextBtn);
      queueMicrotask(() => nextBtn.focus({ preventScroll: true }));
    } else {
      queueMicrotask(() => replayBtn.focus({ preventScroll: true }));
    }
    this.actionsEl.append(replayBtn);
  }

  /** Hides everything (e.g. on replay, or leaving SOLVED state). */
  hide(): void {
    this.root.classList.remove('exp-solved-banner--visible');
    this.actionsEl.replaceChildren();
  }
}
