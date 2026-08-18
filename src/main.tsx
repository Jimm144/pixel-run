import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { migrateLegacyStorage } from './game/originMigration';

const root = createRoot(document.getElementById('root')!);

void migrateLegacyStorage().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
