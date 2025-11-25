# Noteworthy — Automatic Notes

![License Badge](https://img.shields.io/badge/license-Unspecified-lightgrey)
![Status Badge](https://img.shields.io/badge/status-experimental-yellow)

Noteworthy is a beautiful Electron desktop note taker that captures microphone and system audio together, pipes both streams through OpenAI's Realtime transcription API, and keeps every session locally searchable without requiring accounts or sync services.

## Table of Contents
- [Project overview](#project-overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Installation & setup](#installation--setup)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture & structure](#architecture--structure)
- [Built with](#built-with)
- [Testing](#testing)
- [Packaging](#packaging)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)
- [Contact](#contact)

## Project overview
Noteworthy combines microphone and looped-back system audio into a single, searchable live note so you can capture meetings, creative sessions, or YouTube audio without juggling separate transcripts. Every note stays on your machine until you export it, then timestamps, source badges, and human-written highlights give your transcripts clear context.

## Features
- **Dual-source capture** – stream microphone input and system audio into the same note with source badges to distinguish speakers.
- **Live transcripts** – every entry is timestamped, labeled (Microphone vs System Audio), and can be annotated with highlights.
- **Local-first storage** – renderer-managed storage keeps your sessions private unless you pick an export option.
- **One-click exports** – download Markdown summaries or print-ready PDFs directly from the desktop.
- **Backup recording** – optional WAV recorder records the combined audio as a fallback.
- **Localized controls** – set a default transcription language (Bahasa Indonesia included) and prefill a context prompt before the audio is sent.
- **Folder organization** – group recordings by folder with tags, colors, and reusable templates for context and summary prompts.

## Screenshots
![Screenshot 1](.github/screenshot-1.png)

## Installation & setup
1. Install prerequisites: Electron supports macOS, Windows, or Linux, and requires Node.js **v16+**.
2. Clone the repo, then run `npm install` to fetch dependencies.
3. Copy `.env.example` to `.env` and add your OpenAI Realtime API key:
   ```ini
   OPENAI_KEY=sk-...
   ```
4. Start the app with `npm start` (runs `vite build` before launching Electron) or use `npm run dev` when iterating on the renderer UI.

## Usage
1. Launch Noteworthy via `npm start` or the packaged installer.
2. Click **New Live Note**, name the session, and hit **Start capture**.
3. Grant microphone and screen/audio capture permissions if prompted.
4. Transcripts appear in real time with clear Microphone vs System Audio badges.
5. Add highlights directly in the editor while the capture is running.
6. Export to Markdown or PDF whenever you want to share or archive the session.

## Configuration
- `OPENAI_KEY` – required (Realtime API access); place it in the `.env` file at the repo root.
- `OPENAI_API_BASE` – optional override if you are using a proxy or a different OpenAI deployment.
- Audio permissions – macOS and Windows may prompt you for microphone and screen/audio capture on first launch.
- Environment toggles (e.g., `NODE_ENV`) follow the standard Electron/Vite patterns when running `npm run dev` or `npm start`.

## Architecture & structure
- `main.js` – Electron main process entry point.
- `preload.js` – exposes safe APIs to the renderer and manages native helpers.
- `src/renderer` – React + Vite renderer lives here, split into `dashboard`, `components`, `lib`, `workers`, and shared styles; audio utilities stay in `src/audio` and hooks in `src/hooks`.
- `assets` and `public` – static assets used by both renderer and installer builds.
- `dist/` – renderer bundle output; rebuilt via `npm run build:renderer` before packaging.
- `release/` – electron-builder artifacts (`.dmg`, `.zip`, `.exe`, `.AppImage`) appear here.

## Built with
React · Vite · Tailwind · Electron · electron-builder · OpenAI Realtime · LAME audio helpers

## Testing
Manual testing only so far: run `npm run dev` to exercise the renderer UI in Vite’s hot-reload server, and launch `npm start` for a full Electron preview. Document any new manual flows you exercise for future contributors.

## Packaging
1. Ensure `npm run build:renderer` succeeds (included in `npm start`).
2. Run `npm run dist` to rebuild the renderer and invoke `electron-builder`.
3. Use the platform-specific helpers (`npm run dist:mac`, `npm run dist:win`, `npm run dist:linux`) when you need a macOS DMG/ZIP, Windows NSIS/ZIP, or Linux AppImage explicitly.
4. Find installers in `release/Noteworthy-<version>.*`; archive them if you want to keep copies because this folder is overwritten each build.

## Contributing
- Follow the established module organization in `AGENTS.md`: keep UI components under `src/renderer/dashboard/components`, helpers in `renderer/lib`, hooks in `src/hooks`, and audio utilities in `src/audio`.
- Stick to PascalCase for components, camelCase for utilities/hooks, and kebab-case for directories such as `dashboard/components` and `workers`.
- Group imports with external packages before alias paths (`@/renderer`).
- Use two-space indentation in JSX/JS.
- Run `npm run build:renderer` (or `npm run dev`) to verify renderer changes locally before opening a pull request.
- Preface commits with conventional prefixes (e.g., `feat:`, `fix:`, `docs:`) followed by an imperative summary.
- Open issues for bugs, enhancement ideas, or questions; PRs should include verification steps and highlight any manual testing performed.

## Roadmap
- Offline speech-to-text via `whisper.cpp` for local transcription.
- Multi-track export plus advanced search and tagging.
- Workspace sync once the local-first experience stabilizes.

## License
Not specified. Contact the author if you need a license grant or want to propose one.

## Contact
Author: frdteknikelektro@gmail.com

This README follows GitHub community best practices by covering the recommended sections (overview, installation, usage, configuration, contributing, license, and contact) so the project stays easy to understand and contribute to.
