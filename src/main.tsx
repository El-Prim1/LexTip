import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (window.location.pathname === '/translation-test') {
  void import('./TranslationTest.tsx').then(({ default: TranslationTest }) => {
    root.render(<TranslationTest />);
  });
} else {
  root.render(<App />);
}
