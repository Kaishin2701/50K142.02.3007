import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import screens from './screens.json';
import { LiveProvider,useLive } from './LiveContext';
import { useCompactLayout } from './useViewport';
import '../styles/global.css';
import '../styles/figma.css';

const modules = import.meta.glob<{ default: React.ComponentType }>('../features/**/screens/*.tsx');
const views = Object.fromEntries(screens.map(screen => [screen.id, lazy(modules[screen.module])]));

function App() {
  const live=useLive();
  const compact=useCompactLayout();
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
  useEffect(()=>{if(compact)window.scrollTo({top:0,left:0,behavior:'instant'});},[screen.id,compact]);

  useEffect(()=>{
    const related=screens.filter(candidate=>candidate.feature===screen.feature);
    const index=related.findIndex(candidate=>candidate.id===screen.id);
    const timer=window.setTimeout(()=>{
      for(const candidate of related.slice(Math.max(0,index-1),index+4)){
        void modules[candidate.module]().catch(()=>undefined);
      }
    },250);
    return ()=>window.clearTimeout(timer);
  },[screen.id]);

  if(!live.ready)return <main className="design-loading" />;
  return <main className={compact?'compact-viewport':'design-viewport'} style={compact?undefined:{ width, height: 1024 * width / 1440 }}>
    <div className={compact?'compact-canvas':'design-canvas'} style={compact?undefined:{ transform: `scale(${width / 1440})` }}>
      <Suspense fallback={<div className="design-loading" />}>
        <section className="design-content" aria-label={screen.name.split(' - ').slice(1).join(' - ')}>
          <View />
        </section>
      </Suspense>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<LiveProvider><App /></LiveProvider>);
