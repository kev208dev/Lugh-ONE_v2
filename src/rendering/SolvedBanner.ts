/**
 * Tiny DOM-text helper for the two-stage "solved" moment (spec section 5):
 * first a plain "EXPERIMENT STABLE" line, then — after the caller waits
 * ~1.5-2s and calls showSolved() — the level name + "SOLVED" plus a small
 * next/replay affordance. Deliberately NOT a canvas effect and NOT a big
 * modal/card: this is meant to read as a quiet instrument readout, not a
 * game-over screen. No confetti, no giant text, no bright green checks.
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
  private readonly actionsEl: HTMLDivElement;

  private static styleInjected = false;

  constructor(container: HTMLElement) {
    SolvedBanner.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'exp-solved-banner';

    this.stableEl = document.createElement('div');
    this.stableEl.className = 'exp-solved-banner__stable';
    this.stableEl.textContent = 'EXPERIMENT STABLE';

    this.levelEl = document.createElement('div');
    this.levelEl.className = 'exp-solved-banner__level';

    this.solvedEl = document.createElement('div');
    this.solvedEl.className = 'exp-solved-banner__solved';
    this.solvedEl.textContent = 'SOLVED';

    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'exp-solved-banner__actions';

    this.root.append(this.stableEl, this.levelEl, this.solvedEl, this.actionsEl);
    container.appendChild(this.root);
  }

  private static injectStyles(): void {
    if (SolvedBanner.styleInjected) return;
    SolvedBanner.styleInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      .exp-solved-banner {
        position: fixed;
        left: 50%;
        bottom: 8%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 0.7rem 1.4rem;
        background: rgba(10, 13, 20, 0.82);
        border: 1px solid rgba(232, 236, 244, 0.14);
        border-radius: 3px;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #e8ecf4;
        text-align: center;
        letter-spacing: 0.12em;
        opacity: 0;
        transition: opacity 0.4s ease;
        pointer-events: none;
        z-index: 1000;
      }
      .exp-solved-banner.exp-solved-banner--visible {
        display: flex;
        opacity: 1;
      }
      .exp-solved-banner__stable {
        font-size: 0.78rem;
        font-weight: 400;
        opacity: 0.75;
      }
      .exp-solved-banner__level {
        display: none;
        font-size: 0.85rem;
        font-weight: 400;
        opacity: 0.65;
      }
      .exp-solved-banner__solved {
        display: none;
        font-size: 1.1rem;
        font-weight: 600;
        color: #7fb8ff;
      }
      .exp-solved-banner__actions {
        display: none;
        gap: 0.6rem;
        margin-top: 0.3rem;
        pointer-events: auto;
      }
      .exp-solved-banner__btn {
        background: transparent;
        border: 1px solid rgba(127, 184, 255, 0.5);
        color: #e8ecf4;
        font-family: inherit;
        font-size: 0.68rem;
        letter-spacing: 0.1em;
        padding: 0.35rem 0.7rem;
        border-radius: 2px;
        cursor: pointer;
      }
      .exp-solved-banner__btn:hover {
        background: rgba(127, 184, 255, 0.12);
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
    this.levelEl.textContent = `${String(levelIndex).padStart(2, '0')} · ${levelName.toUpperCase()}`;

    this.solvedEl.style.display = 'block';

    this.actionsEl.style.display = 'flex';
    this.actionsEl.replaceChildren();

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'exp-solved-banner__btn';
    replayBtn.textContent = '[ REPLAY ]';
    replayBtn.addEventListener('click', onReplay);

    if (onNext) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'exp-solved-banner__btn';
      nextBtn.textContent = '[ NEXT EXPERIMENT ]';
      nextBtn.addEventListener('click', onNext);
      this.actionsEl.append(nextBtn);
    }
    this.actionsEl.append(replayBtn);
  }

  /** Hides everything (e.g. on replay, or leaving SOLVED state). */
  hide(): void {
    this.root.classList.remove('exp-solved-banner--visible');
    this.actionsEl.replaceChildren();
  }
}
