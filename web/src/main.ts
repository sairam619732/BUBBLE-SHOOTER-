import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { App } from './app';
import { MenuScene } from './ui/menuScene';
import { chooseMove } from './core/bot';

const app = new App(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
app.start(() => new MenuScene(app));

// Hooks for automated UI tests (tools/ui-test). Harmless in production.
(window as unknown as { __bsa: unknown }).__bsa = { app, chooseMove };
