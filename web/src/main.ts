import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/lilita-one/latin-ext-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import '@fontsource/nunito/latin-ext-800.css';
import './style.css';
import { App } from './app';
import { MenuScene } from './ui/menuScene';
import { chooseMove } from './core/bot';
import { sound } from './audio/sound';

const app = new App(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
app.start(() => new MenuScene(app));

// Hooks for automated UI tests (tools/ui-test). Harmless in production.
(window as unknown as { __bsa: unknown }).__bsa = { app, chooseMove, sound };
