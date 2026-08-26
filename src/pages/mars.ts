import { bootstrapDevicePage } from './deviceBootstrap';
import { ReceiverPlanetRenderer } from '../devices/ReceiverPlanet';

const planetCanvas = document.getElementById('planet-canvas') as HTMLCanvasElement;
const planetRenderer = new ReceiverPlanetRenderer(planetCanvas, 'mars');

const { bus } = bootstrapDevicePage('mars');

const powerEl = document.getElementById('power');
const bannerEl = document.getElementById('level-banner');

bus.subscribe((msg) => {
  if (msg.type === 'level-state') {
    if (powerEl) powerEl.textContent = `${Math.round(msg.marsPercent)}%`;
    if (bannerEl) bannerEl.classList.toggle('visible', msg.complete);
    planetRenderer.draw(msg.marsPercent, msg.complete);
  }
});
