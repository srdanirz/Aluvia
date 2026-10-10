import { THEME_COOKIE } from "./theme";

// Runs before first paint so an explicit light/dark choice never flashes the other theme.
// "system" stamps nothing and theme.css resolves it with prefers-color-scheme.
const script = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1];}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
