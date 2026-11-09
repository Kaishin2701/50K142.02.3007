import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import screens from './screens.json';
import { LiveProvider,useLive } from './LiveContext';
import '../styles/global.css';
import '../styles/figma.css';

const modules = import.meta.glob<{ default: React.ComponentType }>('../features/**/screens/*.tsx');
const views = Object.fromEntries(screens.map(screen => [screen.id, lazy(modules[screen.module])]));

function App() {
  const live=useLive();
  const [width, setWidth] = useState(Math.min(window.innerWidth, 1440));
  const screen = live.screen;
  const View = views[screen.id];

  useEffect(() => {
    const resize = () => setWidth(Math.min(window.innerWidth, 1440));
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => { document.title = `${screen.name.split(' - ').slice(1).join(' - ')} · Mê Cà Phê`; }, [screen]);

  return <main className="design-viewport" style={{ width, height: 1024 * width / 1440 }}>
    <div className="design-canvas" style={{ transform: `scale(${width / 1440})` }}>
      <Suspense fallback={<div className="design-loading" />}>
        <section className="design-content" key={screen.id} aria-label={screen.name.split(' - ').slice(1).join(' - ')}>
          <View />
        </section>
      </Suspense>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<LiveProvider><App /></LiveProvider>);
