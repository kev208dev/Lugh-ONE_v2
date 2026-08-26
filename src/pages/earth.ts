import { bootstrapDevicePage } from './deviceBootstrap';
import { ReceiverPlanetRenderer } from '../devices/ReceiverPlanet';

const planetCanvas = document.getElementById('planet-canvas') as HTMLCanvasElement;
const planetRenderer = new ReceiverPlanetRenderer(planetCanvas, 'earth');

const { bus } = bootstrapDevicePage('earth');

const powerEl = document.getElementById('power');
const bannerEl = document.getElementById('level-banner');

bus.subscribe((msg) => {
  if (msg.type === 'level-state') {
    if (powerEl) powerEl.textContent = `${Math.round(msg.earthPercent)}%`;
    if (bannerEl) bannerEl.classList.toggle('visible', msg.complete);
    planetRenderer.draw(msg.earthPercent, msg.complete);
  }
});
