# Repository Guidelines

## Project Structure & Module Organization
- `main.js` boots the Electron main process, `renderer.js` runs the UI/logic, and `preload.js` exposes any safe helpers to the page.
- `index.html` is the renderer entry, so keep DOM wiring and styling in the same directory unless a clear separation is needed.
- Runtime dependencies live under `node_modules/`; do not commit them. Use `.github/` for assets like screenshots so documentation stays consistent with the UI.
- Persistent data is kept in renderer local storage, so the repo itself stays stateless aside from exports and config.

## Build, Test, and Development Commands
- `npm install` – populates `node_modules/` and keeps `package-lock.json` up to date before you start working.
- `npm start` – launches the Electron window (`main.js`) after reading `.env` variables like `OPENAI_KEY`. Ensure a valid Realtime API key is in the root `.env` (don’t push it).
- No additional build steps exist yet; keep changes lightweight and focused on entry points when experimenting locally.

## Coding Style & Naming Conventions
- JavaScript files use two-space indentation, `const`/`let`, and modern ES modules or CommonJS as needed (see current `main.js`/`renderer.js` for examples).
- Prefer descriptive camelCase for functions and lowerCamelCase for DOM elements (e.g., `startBtn`, `noteList`). Keep helper classes (like `Session` or `WavRecorder`) capitalized.
- Keep UI strings and markup near affected modules instead of sprinkling them across unrelated files; follow existing inline template style when updating exports.

## Testing Guidelines
- No automated tests are configured yet. If you add coverage, pick a framework such as `jest` or `mocha` and register new scripts in `package.json`.
- Name tests after the module under test (e.g., `session.test.js`) and place them near the code they cover.
- Document how to run them in this guide once they exist.

## Commit & Pull Request Guidelines
- Follow Conventional Commit formatting (e.g., `feat(notes): add note color tags`, `fix(io): handle denied permissions`).
- PR descriptions should summarize the user-visible change, link related issues, and note any manual steps (permissions, backups) required for verification.
- Attach screenshots or recordings when UI tweaks are involved and mention whether local data (notes, exports) needs resetting before testing.

## Security & Configuration Tips
- Never commit `.env` or your OpenAI key; add it to `.gitignore` if it isn’t already.
- When capturing audio, the app requests permission on first run, so mention this to reviewers if your change touches `navigator.mediaDevices`.
