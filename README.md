# ClimbIQ — AI bouldering coach

Upload a recorded boulder attempt and ClimbIQ analyses your movement in the
browser, then coaches you. It produces three things:

1. **Visual Beta** — a suggested, step-by-step movement sequence with target
   points, movement arrows and body positions (each step is clickable and jumps
   the video to that moment).
2. **Personalised feedback** — what you did well and what to improve, tied to
   timestamps in your video.
3. **Training focus** — 2–3 prioritised skills to practise, with drills.

## How it works

```
Video upload
   → MediaPipe Pose Landmarker        (real body-pose tracking, in-browser)
   → Movement analysis                (joint angles, approx 2D COM, pauses, moves)
   → Muse Spark coaching              (Meta Model API, via a serverless proxy)
   → Visual Beta + Feedback + Training
```

- **Pose estimation is real.** `@mediapipe/tasks-vision` tracks 33 body
  landmarks across sampled frames. The skeleton you see on the video is the
  detected pose, not a mock.
- **Movement analysis is deterministic TypeScript** (`src/lib/movement.ts`).
  The centre of mass is an **approximate 2D estimate** from hips/shoulders.
- **Muse Spark interprets the measurements** into coaching — it does not measure
  them. The call happens server-side so the API key is never exposed.
- **Holds are not detected.** Target markers in the Visual Beta are **suggested
  positions** derived from where your hands/feet actually were. Automatic hold
  detection (Meta SAM 3.1) is a planned stretch feature, not claimed here.
- If pose tracking fails (e.g. the climber isn't clearly in frame) or no API key
  is set, the app shows **clearly-labelled sample data** and tells you why.

## Setup

```bash
npm install
```

### Add your Meta Model API key  ← this is the only place the key goes

The key is used **only** by the serverless function (`netlify/functions/coach.ts`
on Netlify, `api/coach.ts` on Vercel). It is never bundled into the frontend.

1. Copy the example env file:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and paste your key:

   ```ini
   META_API_KEY=your-key-here
   ```

   Get a key at <https://dev.meta.ai>. **Do not** prefix it with `VITE_` —
   anything starting with `VITE_` is exposed to the browser. `.env.local` is
   git-ignored.

### Run locally

The coaching endpoint is a serverless function, so run the app with the Netlify
CLI (it serves both the Vite frontend and `/api/coach`, and reads `.env.local`):

```bash
npm i -g netlify-cli   # once
netlify dev
```

> Plain `npm run dev` runs the frontend only. Uploads will still track pose and
> show the skeleton, but `/api/coach` won't exist, so you'll get the labelled
> "no API key" sample output. Use `netlify dev` for the full pipeline, or just
> click **Try a sample climb**.

### Deploy to Netlify  (primary target)

The repo ships a `netlify.toml` and a function at `netlify/functions/coach.ts`
routed to `/api/coach`.

1. Connect the repo in Netlify. Build settings are picked up from `netlify.toml`
   (build `npm run build`, publish `dist`, functions `netlify/functions`).
2. Add the environment variable under
   **Site settings → Environment variables**:
   - `META_API_KEY` = your key
   - *(optional)* `META_MODEL` (default `muse-spark-1.3`)
   - *(optional)* `META_API_BASE_URL` (default `https://api.meta.ai/v1`)
3. Redeploy so the function picks up the variable.

> **PR previews:** Netlify builds a Deploy Preview per PR. The function runs
> there too, but only if `META_API_KEY` is set for the **Deploy previews** scope
> (Site settings → Environment variables → set the variable's scope to include
> "Deploy Previews", or "All"). Without it the preview falls back to labelled
> sample data — which is the honest, expected behaviour.

### Deploy to Vercel  (also supported)

`vercel.json` + `api/coach.ts` are kept so Vercel works too: import the repo
(preset **Vite**), add `META_API_KEY` under Project → Settings → Environment
Variables, and deploy. Local full-stack dev on Vercel: `vercel dev`.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · `@mediapipe/tasks-vision` ·
Vercel Serverless Functions · Meta Model API (Muse Spark).

## Honesty notes

- Beta is **suggested** movement, not guaranteed instructions.
- Centre of mass is an **approximate** 2D estimate.
- Hold detection is **not** enabled; target markers are suggestions.
- Demo data is always clearly labelled as sample data.
