// @ts-check
/** Placeholder photos for simulated scans and the demo site. Random noise makes every photo unique. */

const WIDTH = 480;
const HEIGHT = 360;
const NOISE_BLOCKS = 70;

/**
 * @param {{ title: string, subtitle: string, hue: number, dark?: boolean }} options
 * @returns {string} JPEG data URL
 */
export function createSyntheticPhoto({ title, subtitle, hue, dark = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  context.fillStyle = `hsl(${hue} 22% ${dark ? 7 : 48}%)`;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < NOISE_BLOCKS; i++) {
    const lightness = dark ? 4 + Math.random() * 8 : 30 + Math.random() * 40;
    context.fillStyle = `hsl(${hue + Math.random() * 40 - 20} 20% ${lightness}%)`;
    context.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 20 + Math.random() * 120, 10 + Math.random() * 60);
  }

  context.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)';
  context.font = '600 26px system-ui, sans-serif';
  context.fillText(title, 20, 300);
  context.font = '400 18px system-ui, sans-serif';
  context.fillText(subtitle, 20, 330);

  return canvas.toDataURL('image/jpeg', 0.6);
}
