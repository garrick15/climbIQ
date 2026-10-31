import type {
  Analysis,
  BetaStep,
  FeedbackItem,
  Hold,
  HoldKind,
  LimbState,
  TrainingFocus,
} from '../types'

/**
 * SAMPLE DATA
 * The interface is built against this shape. When the computer-vision pipeline
 * exists, it should return an `Analysis` and nothing in the UI needs to change.
 */

const DEMO_DURATION = 50

const hold = (
  id: string,
  name: string,
  x: number,
  y: number,
  kind: HoldKind,
  rx = 10,
  ry = 7,
  rot = 0,
): Hold => ({ id, name, x, y, kind, rx, ry, rot })

const holds: Hold[] = [
  // hand holds on the route
  hold('s1', 'Left start jug', 130, 400, 'start', 15, 10, -12),
  hold('s2', 'Right start jug', 215, 395, 'start', 15, 10, 10),
  hold('h3', 'Crimp rail', 120, 320, 'hand', 13, 6, -6),
  hold('h4', 'Sidepull', 240, 300, 'hand', 7, 13, 8),
  hold('h5', 'Pinch', 180, 225, 'hand', 9, 13, -18),
  hold('h6', 'Sloper', 255, 175, 'hand', 17, 12, 20),
  hold('fin', 'Finish jug', 215, 105, 'finish', 17, 11, 0),
  // foot holds on the route
  hold('f1', 'Left foot chip', 110, 480, 'foot', 9, 6, -20),
  hold('f2', 'Right foot chip', 225, 485, 'foot', 9, 6, 15),
  hold('f3', 'High foot chip', 265, 410, 'foot', 8, 6, 30),
  hold('f4', 'Low-left smear chip', 95, 370, 'foot', 9, 6, -10),
  hold('f5', 'Mid-right foot', 205, 375, 'foot', 9, 6, 8),
  hold('f6', 'Mid-left foot', 140, 330, 'foot', 8, 6, -25),
  hold('f7', 'High-right foot', 225, 300, 'foot', 8, 6, 12),
  // off-route holds (detected but not used)
  hold('x1', 'Off-route', 62, 432, 'off', 11, 8, 20),
  hold('x2', 'Off-route', 305, 455, 'off', 12, 8, -15),
  hold('x3', 'Off-route', 312, 335, 'off', 9, 7, 35),
  hold('x4', 'Off-route', 62, 262, 'off', 10, 9, -30),
  hold('x5', 'Off-route', 315, 228, 'off', 11, 7, 10),
  hold('x6', 'Off-route', 105, 170, 'off', 12, 9, 40),
  hold('x7', 'Off-route', 305, 118, 'off', 9, 8, -10),
  hold('x8', 'Off-route', 78, 96, 'off', 11, 7, 18),
  hold('x9', 'Off-route', 165, 505, 'off', 10, 6, -8),
  hold('x10', 'Off-route', 292, 508, 'off', 9, 6, 25),
  hold('x11', 'Off-route', 160, 55, 'off', 10, 8, 5),
  hold('x12', 'Off-route', 62, 350, 'off', 8, 6, -22),
]

const start: LimbState = { lh: 's1', rh: 's2', lf: 'f1', rf: 'f2' }

const beta: BetaStep[] = [
  {
    id: 'step-1',
    title: 'Set up on the starts',
    summary: 'Match both hands on the start jugs with your feet on the low chips.',
    bodyPosition: 'Hips square to the wall, arms straight, weight sitting over both feet.',
    why: 'Starting with straight arms lets your skeleton carry the load, saving your forearms for the crux.',
    yourAttempt: 'You matched cleanly and kept your hips tight to the wall.',
    timestamp: 3.4,
    limbs: start,
    hipShift: 0,
    cue: { text: 'Hips square, arms long', side: 'right' },
  },
  {
    id: 'step-2',
    title: 'High-step the right foot',
    summary: 'Place the right foot on the high chip before moving either hand.',
    bodyPosition:
      'Turn the right knee out and rock your hips over that foot until the left foot feels light.',
    why: 'Getting weight over a higher foot first turns the next reach into a push instead of a pull.',
    yourAttempt:
      'You stood up straight away and placed the foot again twice. Rock over it before you stand.',
    timestamp: 9.6,
    limbs: { ...start, rf: 'f3' },
    hipShift: 12,
    cue: { text: 'Rock over the right foot', side: 'left' },
  },
  {
    id: 'step-3',
    title: 'Reach to the crimp rail',
    summary: 'Left hand to the crimp rail, driving up with the right leg.',
    bodyPosition: 'Keep the left arm long, with hips high and slightly right of centre.',
    why: 'Driving through the leg means the crimp only has to be caught, not pulled on.',
    yourAttempt: 'A smooth reach. Your leg drive was already working well here.',
    timestamp: 14.2,
    limbs: { lh: 'h3', rh: 's2', lf: 'f1', rf: 'f3' },
    hipShift: 10,
    cue: { text: 'Push through the right leg', side: 'left' },
  },
  {
    id: 'step-4',
    title: 'Cross to the sidepull',
    summary: 'Right hand to the sidepull while the left foot moves to the low-left chip.',
    bodyPosition: 'Turn the left hip in toward the wall so your chest points sideways.',
    why: 'Turning in shortens the reach and keeps your weight on your feet instead of your arms.',
    yourAttempt: 'You stayed square to the wall and bent both elbows early, which cost you reach.',
    timestamp: 19.8,
    limbs: { lh: 'h3', rh: 'h4', lf: 'f4', rf: 'f3' },
    hipShift: -4,
    cue: { text: 'Turn the left hip in', side: 'right' },
  },
  {
    id: 'step-5',
    title: 'Deadpoint to the pinch',
    summary: 'Left hand deadpoints to the pinch at the very top of the swing.',
    bodyPosition:
      'Keep the left hip turned in and the left foot pressed on its chip so your body does not swing out.',
    why: 'A deadpoint catches the hold at the moment you weigh almost nothing, so there is no swing to control.',
    yourAttempt:
      'Your hips rotated away from the wall as the left hand released, and the first reach missed.',
    timestamp: 27.5,
    limbs: { lh: 'h5', rh: 'h4', lf: 'f4', rf: 'f3' },
    hipShift: -8,
    cue: { text: 'Stop at the top of the swing', side: 'left' },
    crux: true,
  },
  {
    id: 'step-6',
    title: 'Walk the feet up',
    summary: 'Bring both feet up in small steps, left first, so your hips sit under the next hold.',
    bodyPosition: 'Keep both hands loaded with arms straight while the feet move.',
    why: 'Feet first sets the legs up to push through the long move to the sloper.',
    yourAttempt: 'You paused for about four seconds here with your arms bent.',
    timestamp: 33.8,
    limbs: { lh: 'h5', rh: 'h4', lf: 'f6', rf: 'f5' },
    hipShift: 0,
    cue: { text: 'Feet first, then reset hips', side: 'right' },
  },
  {
    id: 'step-7',
    title: 'Drive to the sloper',
    summary: 'Right hand to the sloper with a smooth push through both legs.',
    bodyPosition: 'Keep your hips close to the wall and use open-hand pressure rather than finger grip.',
    why: 'Slopers are held by body tension and friction, so commit to the push and keep your hips in.',
    yourAttempt: 'You committed well and kept your eyes on the hold.',
    timestamp: 38.9,
    limbs: { lh: 'h5', rh: 'h6', lf: 'f6', rf: 'f5' },
    hipShift: 8,
    cue: { text: 'Drive up from both legs', side: 'left' },
  },
  {
    id: 'step-8',
    title: 'Top out',
    summary: 'Right hand to the finish jug, with the right foot stepping to the high chip.',
    bodyPosition: 'Keep your hips tucked in and finish with control. Match before you stand.',
    why: 'A controlled finish avoids falling off at the top, where it counts most.',
    yourAttempt: 'A controlled finish with both hands on the top.',
    timestamp: 44.6,
    limbs: { lh: 'h5', rh: 'fin', lf: 'f6', rf: 'f7' },
    hipShift: 4,
    cue: { text: 'Stay tight, finish controlled', side: 'right' },
  },
]

const feedback: FeedbackItem[] = [
  {
    id: 'fb-1',
    kind: 'strength',
    timestamp: 3.4,
    title: 'Calm, controlled start',
    observation:
      'Both hands matched on the start jugs and your hips stayed close to the wall through the first two moves.',
    why: 'A stable start keeps the first moves cheap and sets up the high step that follows.',
    skill: 'Setup',
    stepId: 'step-1',
  },
  {
    id: 'fb-2',
    kind: 'improve',
    timestamp: 9.6,
    title: 'Noisy foot placement',
    observation:
      'The right foot landed on the high chip, slid, and was repositioned twice before you stood on it.',
    why: 'Every readjustment costs energy and time, and a slipping foot can unload your hands.',
    tryThis: 'Look the foot onto the chip, place it quietly, and press down before you move a hand.',
    skill: 'Footwork',
    stepId: 'step-2',
  },
  {
    id: 'fb-3',
    kind: 'strength',
    timestamp: 14.2,
    title: 'Leg-driven reach',
    observation:
      'You pushed through the right leg and reached the crimp with a long left arm instead of pulling up.',
    why: 'Reaching with straight arms saves grip strength for the harder moves higher up.',
    skill: 'Leg drive',
    stepId: 'step-3',
  },
  {
    id: 'fb-4',
    kind: 'improve',
    timestamp: 19.8,
    title: 'Elbows bent too early',
    observation:
      'Both elbows stayed bent past a right angle while you hung from the crimp and sidepull.',
    why: 'Bent arms keep your biceps and forearms working constantly, and that adds up before the crux.',
    tryThis:
      'Between moves, drop your shoulders and let your arms hang straight, bending only when you pull.',
    skill: 'Straight-arm efficiency',
    stepId: 'step-4',
  },
  {
    id: 'fb-5',
    kind: 'improve',
    timestamp: 27.5,
    title: 'Hips swung off the wall',
    observation:
      'As the left hand released toward the pinch, your hips rotated away from the wall and your body swung out to the right.',
    why: 'A swinging body forces your hands to catch the momentum, which is why the first reach missed.',
    tryThis:
      'Turn the left hip in before you let go, and press the left foot into its chip so your weight stays under you.',
    skill: 'Hip positioning',
    stepId: 'step-5',
  },
  {
    id: 'fb-6',
    kind: 'improve',
    timestamp: 33.8,
    title: 'Long pause with bent arms',
    observation:
      'You stayed still for around four seconds with bent arms and a tight grip before the next move.',
    why: 'Resting only works with straight arms. Otherwise you spend energy without recovering.',
    tryThis: 'Straighten your arms, sink your heels and shake out one hand at a time if the holds allow.',
    skill: 'Straight-arm efficiency',
    stepId: 'step-6',
  },
  {
    id: 'fb-7',
    kind: 'strength',
    timestamp: 38.9,
    title: 'Committed on the sloper',
    observation:
      'You kept moving through the long reach to the sloper, and your eyes stayed on the target hold.',
    why: 'Hesitating on a sloper lets friction slip away. Committing keeps the move smooth.',
    skill: 'Commitment',
    stepId: 'step-7',
  },
]

const training: TrainingFocus[] = [
  {
    id: 'tr-1',
    rank: 1,
    skill: 'Hip positioning',
    headline: 'Keep your hips in at the crux',
    reason:
      'Your hips left the wall as you released the left hand. This was the biggest single loss of control in the clip.',
    impact: 'High',
    impactScore: 88,
    cue: 'Hips in, then hands.',
    cadence: '2 sessions a week for 3 weeks',
    evidence: [{ timestamp: 27.5, label: 'Crux swing' }],
    drills: [
      {
        name: 'Flagging ladders',
        prescription: '4 × 3 climbs',
        detail:
          'On a vertical wall, climb eight moves flagging a different leg on each move without letting your hips rotate out.',
      },
      {
        name: 'Drop-knee traverse',
        prescription: '3 × 2 lengths',
        detail:
          'Traverse on easy holds with a drop knee on every move, finishing each move with your hip touching the wall.',
      },
      {
        name: 'Deadpoint reps',
        prescription: '5 × 5 moves',
        detail:
          'Pick a hold at a comfortable stretch and practise catching it at the top of the swing without your feet cutting loose.',
      },
    ],
  },
  {
    id: 'tr-2',
    rank: 2,
    skill: 'Footwork',
    headline: 'Place feet once, quietly',
    reason:
      'Readjusting the high foot cost time and briefly unloaded your hands early on, when you should be saving energy.',
    impact: 'Medium',
    impactScore: 68,
    cue: 'Look it on, place it, press it.',
    cadence: '2 sessions a week for 2 weeks',
    evidence: [{ timestamp: 9.6, label: 'Foot slid twice' }],
    drills: [
      {
        name: 'Silent feet',
        prescription: '3 × 5 min',
        detail:
          'Climb easy routes making no sound with your feet. If you hear a scuff, step down and place it again.',
      },
      {
        name: 'Hover and place',
        prescription: '3 × 10 moves',
        detail:
          'Hold your foot over the chip for a full second, then set it down precisely without sliding.',
      },
    ],
  },
  {
    id: 'tr-3',
    rank: 3,
    skill: 'Straight-arm efficiency',
    headline: 'Hang from your skeleton, not your biceps',
    reason:
      'Bent arms on the sidepull and during the long pause made the final moves harder than they needed to be.',
    impact: 'Medium',
    impactScore: 61,
    cue: 'Long arms, low shoulders.',
    cadence: '2 sessions a week for 3 weeks',
    evidence: [
      { timestamp: 19.8, label: 'Early elbow bend' },
      { timestamp: 33.8, label: 'Bent-arm pause' },
    ],
    drills: [
      {
        name: 'Straight-arm hangs',
        prescription: '5 × 20 s',
        detail:
          'Hang on large jugs with straight arms and low shoulders. Notice how little effort the position needs.',
      },
      {
        name: 'Move and reset',
        prescription: '4 × 6 moves',
        detail: 'On easy climbs, pause for three seconds with straight arms after every single move.',
      },
      {
        name: 'Active rests',
        prescription: '3 × 2 min',
        detail:
          'Practise finding the best rest on a route, then shaking out each hand without bending your arms.',
      },
    ],
  },
]

const round = (n: number) => Math.round(n * 10) / 10

/**
 * Returns the sample analysis. If a real clip length is given, every timestamp
 * is scaled to fit inside it so seeking and markers always land within the video.
 */
export function buildDemoAnalysis(durationSec?: number): Analysis {
  const duration = durationSec && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : DEMO_DURATION
  const k = duration / DEMO_DURATION

  return {
    source: 'demo',
    climb: {
      outcome: 'Topped out',
      durationSec: duration,
      moves: beta.length,
      holdsDetected: holds.length,
    },
    metrics: [
      { id: 'fluency', label: 'Movement fluency', value: 72, note: 'Mostly continuous, with one long pause' },
      { id: 'body', label: 'Body positioning', value: 58, note: 'Hips drifted from the wall at the crux' },
      { id: 'feet', label: 'Footwork precision', value: 64, note: 'The high foot was placed three times' },
      { id: 'arms', label: 'Arm efficiency', value: 69, note: 'Elbows bent early on the sidepull' },
    ],
    holds,
    beta: beta.map((s) => ({ ...s, timestamp: round(s.timestamp * k) })),
    feedback: feedback.map((f) => ({ ...f, timestamp: round(f.timestamp * k) })),
    training: training.map((t) => ({
      ...t,
      evidence: t.evidence.map((e) => ({ ...e, timestamp: round(e.timestamp * k) })),
    })),
  }
}
