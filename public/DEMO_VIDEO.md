# Demo climb video

The **"Run the demo climb"** button on the upload screen loads a bundled clip
and runs the full real pipeline on it (MediaPipe pose + Muse Spark coaching) —
so a judge can see a live analysis without picking a file.

## Add your clip

Drop your own copyright-safe video here, named exactly:

    public/demo-climb.mp4

Guidelines for a reliable, fast demo:
- **Short:** 10–25 seconds of the actual attempt (shorter = faster analysis,
  stays well within the serverless time budget).
- **Side-on or slightly front-on**, whole body + wall in frame, steady camera,
  even lighting — this maximises pose-detection quality.
- MP4 (H.264) plays everywhere.

If `public/demo-climb.mp4` is missing, the button shows a friendly error and
you can still use "Choose a video" or "Sample data".
