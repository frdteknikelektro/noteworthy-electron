# Repository Guidelines

## Project Structure & Module Organization
- `src/renderer` hosts the App, dashboard, settings modal, workers, and shared styles; keep UI components in `dashboard/components`, helpers in `renderer/lib`, hooks in `src/hooks`, and audio utilities in `src/audio`.
- `main.js`/`preload.js` drive the Electron main/preload processes. Static assets live under `public` and `assets`, renderer builds go to `dist/`, and packaged installers land in `release/`.
- `package.json` lists runtime and dev dependencies tied to React/Vite/Electron; keep the config files (`tsconfig.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`) focused on their domains.

## Build, Test, and Development Commands
- `npm run dev` – start the Vite dev server for `src/renderer/index.jsx` and iterate on UI with hot reload.
- `npm run build:renderer` – output the renderer bundle to `dist/` before packaging or manual QA.
- `npm run start` – rebuild the renderer and launch Electron (main + preload) for a full desktop preview.
- `npm run dist[:platform]` – run `electron-builder` after `build:renderer`; use `dist:mac`, `dist:win`, or `dist:linux` for platform-specific installers.
- Testing is manual: exercise renderer flows via the dev server and native app; document new manual steps so others can repeat them.

## Coding Style & Naming Conventions
- Follow React + Vite norms: PascalCase for components, camelCase for hooks/utilities, kebab-case for component directories like `dashboard/components` and `workers`.
- Use two-space indentation in JSX/JS and group imports (external packages before alias imports such as `@/renderer`).
- Keep Tailwind classes adjacent to the markup they style and avoid unused utilities to limit churn.
- There is no enforced formatter yet; use `npm run build:renderer` failures and future lint targets as the signal for cleanup.

## Testing Guidelines
- There is currently no automated suite. Before merging, manually exercise renderer flows via the dev server and native preview (`npm run start`), and document those steps for future contributors.

## Commit & Pull Request Guidelines
- Follow semantic commits (`feat:`, `refactor:`, `fix:` etc.) with a short imperative description and references to issues/PRs when available.
- PRs need a clear summary, verification steps (commands or manual flows), and any UI screenshots/videos; note the platforms you validated when packaging changes land.

## Security & Configuration Tips
- `.env` is consumed during packaging but never committed—share secrets out of band and keep the repository free of credentials.
