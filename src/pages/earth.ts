import type { WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { ReceiverPlanetRenderer } from '../devices/ReceiverPlanet';
import { LightRenderer } from '../rendering/LightRenderer';
import { windowRectGlobal, globalToLocal } from '../runtime/globalCoords';
import { clipSegmentToRect } from '../optics/Ray';
import { currentLevel } from '../level/session';
import type { PuzzleState } from '../level/types';

/** How far past this window the incoming beam's test segment reaches, in
 * global pixels — just needs to be larger than any plausible screen diagonal. */
const RAY_TEST_DISTANCE = 1_000_000;

const rayCanvas = document.getElementById('ray-canvas') as HTMLCanvasElement;
const rayRenderer = new LightRenderer(rayCanvas); // incoming beam from PRISM

const planetCanvas = document.getElementById('planet-canvas') as HTMLCanvasElement;
const planetRenderer = new ReceiverPlanetRenderer(planetCanvas, 'earth');
const level = currentLevel();
const goalMinPower = level?.goal.receivers.find((requirement) => requirement.receiverId === 'earth')?.minPower ?? 100;
let percent = 0;
let puzzleState: PuzzleState = 'PLAYING';
let stabilizeProgress = 0;
let solvedAtMs: number | undefined;
let animationFrame: number | undefined;

function drawPlanet(): void {
  planetRenderer.draw({ percent, goalMinPower, puzzleState, stabilizeProgress, solvedAtMs }, performance.now());
  if (animationFrame === undefined && (puzzleState === 'STABILIZING' || (solvedAtMs !== undefined && performance.now() - solvedAtMs < 900))) {
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined;
      drawPlanet();
    });
  }
}

drawPlanet();

let selfGeometry: WindowGeometry | undefined;
/** Screen position this window was launched at — EARTH/MARS are meant to be
 * fixed targets, not something the player drags, so if the OS window ever
 * moves away from its launch spot (accidental drag, snap-to-edge, etc.) it
 * snaps back. */
let lockedScreen: { x: number; y: number } | undefined;

const { bus } = bootstrapDevicePage('earth', {
  onSelfUpdate: (g) => {
    selfGeometry = g;
    if (!lockedScreen) {
      lockedScreen = { x: g.screenX, y: g.screenY };
    } else if (Math.abs(g.screenX - lockedScreen.x) > 1 || Math.abs(g.screenY - lockedScreen.y) > 1) {
      window.moveTo(lockedScreen.x, lockedScreen.y);
    }
  }
});

const powerEl = document.getElementById('power');
const bannerEl = document.getElementById('level-banner');

bus.subscribe((msg) => {
  if (msg.type === 'level-state') {
    percent = msg.earthPercent;
    if (powerEl) powerEl.textContent = `${Math.round(msg.earthPercent)}%`;
    if (bannerEl) bannerEl.classList.toggle('visible', msg.complete);
    drawPlanet();

    if (selfGeometry && msg.earthBeam) {
      const { originGlobal, directionGlobal, color } = msg.earthBeam;
      const p1 = originGlobal;
      const p2 = { x: p1.x + directionGlobal.x * RAY_TEST_DISTANCE, y: p1.y + directionGlobal.y * RAY_TEST_DISTANCE };
      const myRect = windowRectGlobal(selfGeometry);
      const clipped = clipSegmentToRect(p1, p2, myRect);
      if (clipped) {
        rayRenderer.drawSegment(globalToLocal(clipped[0], selfGeometry), globalToLocal(clipped[1], selfGeometry), color);
      } else {
        rayRenderer.clear();
      }
    } else {
      rayRenderer.clear();
    }
  } else if (msg.type === 'puzzle-state') {
    const wasSolved = puzzleState === 'SOLVED';
    puzzleState = msg.state;
    stabilizeProgress = msg.holdProgress;
    if (!wasSolved && puzzleState === 'SOLVED') solvedAtMs = performance.now();
    drawPlanet();
  }
});
