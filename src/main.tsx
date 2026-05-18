import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from '@/App';
import '@/index.css';
// Side-effect import ensures the theme is applied as early as the module
// graph loads, in addition to the pre-paint script in index.html.
import '@/stores/themeStore';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Auto-update the service worker without bothering the user.
registerSW({ immediate: true });
