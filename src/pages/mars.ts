import type { ReceiverBeam, WindowGeometry } from '../runtime/types';
import { bootstrapDevicePage } from './deviceBootstrap';
import { ReceiverPlanetRenderer, type PlanetSpectrumBand } from '../devices/ReceiverPlanet';
import { LightRenderer, type ColoredBeamSegment } from '../rendering/LightRenderer';
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
const planetRenderer = new ReceiverPlanetRenderer(planetCanvas, 'mars');
const level = currentLevel();
const goalMinPower = level?.goal.receivers.find((requirement) => requirement.receiverId === 'mars')?.minPower ?? 100;
let percent = 0;
let puzzleState: PuzzleState = 'PLAYING';
let stabilizeProgress = 0;
let solvedAtMs: number | undefined;
let animationFrame: number | undefined;
let spectrumBands: PlanetSpectrumBand[] = [];

function drawPlanet(): void {
  planetRenderer.draw({ percent, goalMinPower, puzzleState, stabilizeProgress, solvedAtMs, spectrumBands }, performance.now());
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

const { bus } = bootstrapDevicePage('mars', {
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

function drawIncomingSpectrum(beam: ReceiverBeam | null): void {
  if (!selfGeometry || !beam) {
    rayRenderer.clear();
    return;
  }

  const rect = windowRectGlobal(selfGeometry);
  const segments: ColoredBeamSegment[] = [];
  for (const band of beam.bands) {
    const p1 = band.originGlobal;
    const p2 = {
      x: p1.x + band.directionGlobal.x * RAY_TEST_DISTANCE,
      y: p1.y + band.directionGlobal.y * RAY_TEST_DISTANCE
    };
    const clipped = clipSegmentToRect(p1, p2, rect);
    if (!clipped) continue;
    segments.push({
      start: globalToLocal(clipped[0], selfGeometry),
      end: globalToLocal(clipped[1], selfGeometry),
      color: band.color,
      intensity: band.intensity
    });
  }
  rayRenderer.drawSpectralSegments(segments);
}

bus.subscribe((msg) => {
  if (msg.type === 'level-state') {
    percent = msg.marsPercent;
    spectrumBands = msg.marsBeam?.bands.map(({ color, intensity }) => ({ color, intensity })) ?? [];
    if (powerEl) powerEl.textContent = `${Math.round(msg.marsPercent)}%`;
    if (bannerEl) bannerEl.classList.toggle('visible', msg.complete);
    drawPlanet();
    drawIncomingSpectrum(msg.marsBeam);
  } else if (msg.type === 'puzzle-state') {
    const wasSolved = puzzleState === 'SOLVED';
    puzzleState = msg.state;
    stabilizeProgress = msg.holdProgress;
    if (!wasSolved && puzzleState === 'SOLVED') solvedAtMs = performance.now();
    drawPlanet();
  }
});
