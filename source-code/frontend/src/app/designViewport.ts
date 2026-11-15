// All pages share the 1440px-wide Figma composition. Resize the document as a
// whole, without remounting the shell, checkout state or any open native dialog.
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
    const scale = availableWidth / DESIGN_WIDTH;
    root.style.setProperty('--design-scale', String(scale));
    root.style.setProperty('--design-viewport-width', `${DESIGN_WIDTH}px`);
    root.style.setProperty('--design-viewport-height', `${window.innerHeight / scale}px`);
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
