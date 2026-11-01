# ClimbIQ — AI bouldering coach

Upload a recorded boulder attempt and ClimbIQ analyses your climbing **in the
browser**, then coaches you like a human coach would — move by move.

Think **chess.com's move analysis, for climbing**: every move gets a verdict, a
clear instruction, and the reason behind it.

## What you get after an analysis

- **Annotated footage** — your real video with the detected body skeleton, the
  target hold for each move, movement arrows, and a floating instruction label,
  all synced to playback.
- **Move-by-move coaching** (right panel) — a verdict (`Best` / `Good` /
  `Inaccuracy` / `Mistake`), the single instruction (“Right hand up to the
  sloper”), the reason, a *Your attempt vs Recommended* compare, ordered
  movement steps, and a coach note.
- **Feedback** — short, direct, actionable notes: what you did well and what to
  fix, each tied to a timestamp.
- **Climber metrics** — Confidence, Stability, Centre of Mass and Balance, plus
  scored skills (Movement fluency, Body positioning, Footwork, Arm efficiency).
- **Demonstrate the beta** — a player that walks through the suggested sequence
  for when you’re stuck and want to see how to do it.

## How it works

```
Video upload
  → MediaPipe Pose Landmarker     real 33-point body tracking, in-browser
  → Movement + biomechanics       joint angles, 2D COM, stability, sway, pauses,
                                   move segmentation (deterministic TypeScript)
  → SAM 3.1 hold detection        best-effort hold segmentation (via a proxy)
  → Muse Spark coaching           Meta Model API interprets the measurements
  → Annotated review + coaching
```

- **Pose estimation is real** — `@mediapipe/tasks-vision` tracks 33 landmarks
  across sampled frames. The skeleton on the video is the detected pose.
- **Biomechanics are measured, not guessed** (`src/lib/biomechanics.ts`):
  centre of mass, torso inclination, joint angles, support-triangle stability,
  COM sway/jerk, asymmetry. These are **2D approximations from one camera.**
- **Muse Spark interprets** those numbers into coaching — it does not measure
  them. The call runs **server-side**, so your API key is never exposed.
- **Hold detection (SAM 3.1) is best-effort** and labelled *approximate*. If it
  finds too few holds, the beta falls back to suggested targets from your hand
  positions. Hold **shape** = type (jug/crimp/sloper…); hold **colour** on the
  wall is sampled for future route filtering.
- **Honest by design:** beta is *suggested* movement, COM/stability are
  *approximate*, and if a real analysis can’t run you get clearly-labelled
  sample data that explains why.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · `@mediapipe/tasks-vision`
(pose) · Meta Model API — **Muse Spark** (coaching) + **SAM 3.1** (holds) ·
Netlify Functions (Vercel also supported).

---

## Setup

### 1. Install

```bash
npm install
```

On install, `scripts/prepare-mediapipe.mjs` runs automatically: it copies the
MediaPipe WASM and downloads the pose model into `public/mediapipe/` so the app
serves them from its own origin (avoids CDN/CSP issues). This needs network
access and is also run before every build.

### 2. Add your Meta Model API key

The key is read **only** by the serverless function (`netlify/functions/coach.ts`
on Netlify, `api/coach.ts` on Vercel). It is **never** bundled into the frontend.

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your key (get one at <https://dev.meta.ai>):

```ini
META_API_KEY=your-key-here
```

> Do **not** prefix it with `VITE_` — anything starting with `VITE_` is exposed
> to the browser. `.env.local` is git-ignored.

Optional overrides (defaults shown):

```ini
META_API_BASE_URL=https://api.meta.ai/v1
META_MODEL=muse-spark-1.3
```

### 3. Run locally

The coaching + hold-detection endpoints are serverless functions, so run with
the Netlify CLI (it serves the Vite frontend **and** the functions, and reads
`.env.local`):

```bash
npm i -g netlify-cli   # once
netlify dev
```

Then open the printed URL and click **Run the demo climb** (bundled clip) or
**Choose a video**.

> Plain `npm run dev` serves the frontend only — pose tracking and the skeleton
> still work, but `/api/coach` won’t exist, so coaching falls back to labelled
> sample data. Use `netlify dev` for the full pipeline.

---

## Deploy to Netlify (primary target)

Build settings come from `netlify.toml` (build `npm run build`, publish `dist`,
functions in `netlify/functions`). Then:

1. Connect the repo in Netlify.
2. **Site settings → Environment variables** → add:
   - `META_API_KEY` = your key
   - *(optional)* `META_MODEL`, `META_API_BASE_URL`
   - Set the scope to include **Deploy Previews** if you want previews to run
     real analysis (otherwise previews show labelled sample data).
3. Redeploy so the functions pick up the key.

### Deploy to Vercel (also supported)

`vercel.json` + the `api/` functions mirror the Netlify setup. Import the repo
(preset **Vite**), add `META_API_KEY` under Project → Settings → Environment
Variables, and deploy.

---

## Demo day checklist

1. Drop a short, copyright-safe clip at **`public/demo-climb.mp4`**
   (10–25s, side-on, whole body + wall in frame — see `public/DEMO_VIDEO.md`).
2. Set `META_API_KEY` on the host (Production scope).
3. **Pre-warm once**: click *Run the demo climb* right before judging so the
   function is hot and MediaPipe assets are cached — the judged run is then fast.
4. Have a screen recording as a network-failure backup.

---

## Project structure

```
src/
  App.tsx                     app state + view routing (upload → processing → results)
  components/
    UploadView.tsx            upload screen + "Run the demo climb"
    ProcessingView.tsx        analysis progress
    LiveAnalysisView.tsx      live pose/box/stats while analysing
    ResultsView.tsx           review screen (video + coach panel + metrics)
    VideoPanel.tsx            video with skeleton + beta overlays
    BetaVideoOverlay.tsx      target holds / arrows / instruction on the footage
    SkeletonOverlay.tsx       detected pose drawn on the video
    MoveCoachPanel.tsx        chess.com-style per-move coaching
    FeedbackPanel.tsx         feedback list + climber-stat strip
    BetaDemo.tsx              "Demonstrate the beta" player
    BetaWall.tsx, HoldShape.tsx   wall diagram + typed hold glyphs
  lib/
    pose-estimation.ts        MediaPipe pose over sampled frames
    movement.ts               movement observations from the pose track
    biomechanics.ts           per-frame + sequence biomechanics (COM, angles…)
    climberMetrics.ts         biomechanics → climber-friendly readouts
    holds.ts, holdTypes.ts    SAM hold detection + type/colour estimation
    analyse.ts                orchestrates the full pipeline (the seam)
    build-analysis.ts         assembles the UI-ready Analysis (+ safe fallbacks)
  types.ts                    shared types (Analysis, BetaStep, …)
api/                          Vercel serverless functions (coach, holds)
netlify/functions/            Netlify serverless functions (coach, holds, _guard)
```

## Safeguards

- **API key** stays server-side; never shipped to the browser.
- **Abuse guard** (`netlify/functions/_guard.ts`): same-origin check, request
  body-size cap, best-effort per-IP rate limit — the endpoints spend a paid
  Meta budget.
- **Timeouts**: coaching is a text-only request within the ~26s function budget;
  slow calls fall back to labelled sample data rather than hanging.
- **Never blank**: an error boundary + defensive normalisation keep the UI
  working even if the model returns partial or odd output.
