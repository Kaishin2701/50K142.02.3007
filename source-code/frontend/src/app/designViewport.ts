// Share one Figma composition. Narrow windows scale down; wide desktops use
// extra content space without magnifying the sidebar, text or controls.
export const DESIGN_WIDTH = 1440;

export function installDesignViewport() {
  const root = document.documentElement;
  // Measure the browser scrollbar before applying document zoom. Reserving its
  // space keeps the scale stable when a page or a dialog changes content height.
  const scrollbar = root.clientWidth > 0
    ? Math.max(0, window.innerWidth - root.clientWidth)
    : 0;
  const update = () => {
    const availableWidth = Math.max(1, window.innerWidth - scrollbar);
    const scale = Math.min(1, availableWidth / DESIGN_WIDTH);
    root.style.setProperty('--design-scale', String(scale));
    root.style.setProperty('--design-viewport-width', `${Math.max(DESIGN_WIDTH, availableWidth)}px`);
    root.style.setProperty('--design-viewport-height', `${window.innerHeight / scale}px`);
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
