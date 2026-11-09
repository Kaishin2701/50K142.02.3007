import { useSyncExternalStore } from 'react';

function subscribe(onChange:()=>void){
  window.addEventListener('resize',onChange);
  return ()=>window.removeEventListener('resize',onChange);
}

export function useCompactLayout(){
  return useSyncExternalStore(subscribe,()=>window.innerWidth<1200,()=>false);
}
