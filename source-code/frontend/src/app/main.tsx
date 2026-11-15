import { createRoot } from 'react-dom/client';
import App from './App';
import { installDesignViewport } from './designViewport';
import '../styles/application.css';

const stopDesignViewport = installDesignViewport();
if (import.meta.hot) import.meta.hot.dispose(stopDesignViewport);

createRoot(document.getElementById('root')!).render(<App />);
