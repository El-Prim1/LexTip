import { createRoot } from 'react-dom/client';
import TranslationTest from './TranslationTest.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(<TranslationTest />);
