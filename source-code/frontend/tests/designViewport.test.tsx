import { afterEach, expect, it, vi } from 'vitest';
import { DESIGN_WIDTH, installDesignViewport } from '../src/app/designViewport';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('style');
});

it('keeps the same Figma canvas on wide, narrow desktop and phone windows', () => {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1425);
  let width = 1440;
  vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => width);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
  stop = installDesignViewport();
  for (width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
    window.dispatchEvent(new Event('resize'));
    const style = document.documentElement.style;
    const scale = Number(style.getPropertyValue('--design-scale'));
    expect(style.getPropertyValue('--design-viewport-width')).toBe('1440px');
    expect(DESIGN_WIDTH * scale).toBeCloseTo(width - 15);
    expect(parseFloat(style.getPropertyValue('--design-viewport-height')) * scale).toBeCloseTo(900);
  }
});

it('updates the available height and removes the resize listener on disposal', () => {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1440);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440);
  const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1024);
  stop = installDesignViewport();
  height.mockReturnValue(720);
  window.dispatchEvent(new Event('resize'));
  expect(document.documentElement.style.getPropertyValue('--design-viewport-height')).toBe('720px');
  stop();
  height.mockReturnValue(900);
  window.dispatchEvent(new Event('resize'));
  expect(document.documentElement.style.getPropertyValue('--design-viewport-height')).toBe('720px');
});
