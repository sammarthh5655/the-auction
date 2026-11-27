/**
 * Signature poses for the stylized cricketer rig (degrees, Euler XYZ, character faces +Z,
 * character's left = +X). Written for a right-hander; left-handers are mirrored by the renderer.
 *   arm hanging down: x -90 = forward, x -180 = straight up, z (left arm +) = out to the side
 *   knees bend with +x, hips flex forward with -x
 * `bat`  : rotation of the bat inside the right hand (null = no bat)
 * `ball` : 'R' puts a ball in the right hand
 * `drop` : lowers the whole body (crouches / kneeling)
 * `motion`: subtle looping animation [{ j: joint, a: axis 0|1|2, amp: degrees, spd }]
 * `spin` : continuously spins the bat around an axis (helicopter, sword twirl)
 */
const P = (o) => ({
  hips: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0],
  lSh: [0, 0, 8], lEl: [0, 0, 0], rSh: [0, 0, -8], rEl: [0, 0, 0],
  lHip: [0, 0, 3], lKnee: [0, 0, 0], rHip: [0, 0, -3], rKnee: [0, 0, 0],
  bat: null, ball: null, drop: 0, motion: [], spin: null, gloves: true, ...o,
});

export const POSE_LIBRARY = {
  portrait: P({ gloves: false, motion: [{ j: 'head', a: 1, amp: 6, spd: 0.6 }] }),
  stand: P({ bat: [80, 0, 0], motion: [{ j: 'spine', a: 0, amp: 1.5, spd: 1.4 }] }),
  'cover-drive': P({
    hips: [0, -35, 0], spine: [28, -15, 0], head: [10, 30, 0],
    lSh: [-55, 35, 25], lEl: [-35, 0, 0], rSh: [-45, 30, -5], rEl: [-50, 0, 0],
    lHip: [-60, 20, 8], lKnee: [70, 0, 0], rHip: [30, 0, -10], rKnee: [8, 0, 0],
    bat: [5, 0, 25], drop: 0.15, motion: [{ j: 'spine', a: 0, amp: 2, spd: 1.2 }],
  }),
  helicopter: P({
    hips: [0, 30, 0], spine: [-6, 40, 0], head: [-18, -20, 0],
    lSh: [-160, 0, 30], lEl: [-35, 0, 0], rSh: [-170, 0, -25], rEl: [-30, 0, 0],
    lHip: [-10, 0, 16], lKnee: [18, 0, 0], rHip: [0, 0, -16], rKnee: [14, 0, 0],
    bat: [180, 0, 0], spin: { axis: 1, speed: 9 }, drop: 0.04,
  }),
  'pull-shot': P({
    hips: [0, 55, 0], spine: [-5, 45, 0], head: [-5, -50, 0],
    lSh: [-90, -40, 30], lEl: [-50, 0, 0], rSh: [-95, 20, -55], rEl: [-55, 0, 0],
    lHip: [-35, 0, 24], lKnee: [50, 0, 0], rHip: [5, 0, -5], rKnee: [10, 0, 0],
    bat: [-90, 0, 90], motion: [{ j: 'spine', a: 1, amp: 4, spd: 1.6 }],
  }),
  'straight-drive': P({
    hips: [0, -20, 0], spine: [14, -10, 0], head: [8, 15, 0],
    lSh: [-158, 10, 14], lEl: [-25, 0, 0], rSh: [-150, 0, -10], rEl: [-40, 0, 0],
    lHip: [-45, 10, 6], lKnee: [45, 0, 0], rHip: [20, 0, -8], rKnee: [10, 0, 0],
    bat: [40, 0, 0], drop: 0.1,
  }),
  'lofted-drive': P({
    hips: [0, 25, 0], spine: [-12, 30, 0], head: [-15, -15, 0],
    lSh: [-170, 0, 35], lEl: [-30, 0, 0], rSh: [-175, 0, -30], rEl: [-35, 0, 0],
    lHip: [-30, 0, 14], lKnee: [30, 0, 0], rHip: [10, 0, -10], rKnee: [12, 0, 0],
    bat: [45, 0, 20], drop: 0.05, motion: [{ j: 'spine', a: 1, amp: 3, spd: 1.3 }],
  }),
  scoop: P({
    hips: [0, 0, 0], spine: [30, 0, 0], head: [-25, 0, 0],
    lSh: [-125, -10, 10], lEl: [-20, 0, 0], rSh: [-125, 10, -10], rEl: [-20, 0, 0],
    lHip: [-80, 0, 18], lKnee: [100, 0, 0], rHip: [-15, 0, -12], rKnee: [115, 0, 0],
    bat: [200, 0, 0], drop: 0.38,
  }),
  sweep: P({
    hips: [0, -20, 0], spine: [40, -25, 0], head: [10, 20, 0],
    lSh: [-70, 0, 30], lEl: [-20, 0, 0], rSh: [-65, 0, -45], rEl: [-30, 0, 0],
    lHip: [-85, 0, 18], lKnee: [85, 0, 0], rHip: [15, 0, -8], rKnee: [110, 0, 0],
    bat: [-80, 0, -60], drop: 0.42,
  }),
  'upper-cut': P({
    hips: [0, -10, 0], spine: [-15, -20, -8], head: [-20, 25, 0],
    lSh: [-140, -30, 50], lEl: [-20, 0, 0], rSh: [-150, -10, -20], rEl: [-30, 0, 0],
    lHip: [-20, 0, 14], lKnee: [25, 0, 0], rHip: [5, 0, -10], rKnee: [10, 0, 0],
    bat: [-150, 0, 50], drop: 0.05,
  }),
  'switch-hit': P({
    hips: [0, -60, 0], spine: [-5, -45, 0], head: [-5, 50, 0],
    lSh: [-95, -20, 55], lEl: [-55, 0, 0], rSh: [-90, 40, -30], rEl: [-50, 0, 0],
    lHip: [5, 0, 5], lKnee: [10, 0, 0], rHip: [-35, 0, -24], rKnee: [50, 0, 0],
    bat: [-90, 0, -90], motion: [{ j: 'spine', a: 1, amp: 4, spd: 1.6 }],
  }),
  'bat-raise': P({
    spine: [-6, 0, 0], head: [-18, 0, 0],
    lSh: [-20, 0, 60], lEl: [-80, 0, 0], rSh: [-178, 0, -12], rEl: [-5, 0, 0],
    lHip: [-10, 0, 6], lKnee: [10, 0, 0], rHip: [0, 0, -6],
    bat: [180, 0, 0], oneHand: true, motion: [{ j: 'rSh', a: 2, amp: 5, spd: 2 }],
  }),
  'forward-defence': P({
    hips: [0, -30, 0], spine: [28, -10, 0], head: [12, 20, 0],
    lSh: [-55, 20, 20], lEl: [-45, 0, 0], rSh: [-40, 20, -8], rEl: [-35, 0, 0],
    lHip: [-45, 10, 8], lKnee: [50, 0, 0], rHip: [12, 0, -10], rKnee: [8, 0, 0],
    bat: [10, 0, 0], drop: 0.12,
  }),
  'fast-bowl': P({
    hips: [0, -25, 0], spine: [-14, -20, 0], head: [-5, 25, 0],
    lSh: [-60, 0, 70], lEl: [-70, 0, 0], rSh: [-178, 0, -8], rEl: [0, 0, 0],
    lHip: [-45, 0, 6], lKnee: [12, 0, 0], rHip: [40, 0, -6], rKnee: [55, 0, 0],
    ball: 'R', gloves: false, drop: 0.05, motion: [{ j: 'rSh', a: 0, amp: 6, spd: 2.2 }],
  }),
  'sling-bowl': P({
    hips: [0, -30, 0], spine: [-10, -25, 18], head: [0, 25, -10],
    lSh: [-40, 0, 60], lEl: [-80, 0, 0], rSh: [-30, 0, -100], rEl: [-10, 0, 0],
    lHip: [-40, 0, 8], lKnee: [15, 0, 0], rHip: [35, 0, -8], rKnee: [50, 0, 0],
    ball: 'R', gloves: false, drop: 0.06, motion: [{ j: 'rSh', a: 1, amp: 8, spd: 2.4 }],
  }),
  'short-run-bowl': P({
    hips: [0, -15, 0], spine: [-12, -10, 0], head: [-8, 12, 0],
    lSh: [-125, 0, 18], lEl: [0, 0, 0], rSh: [-168, 0, -14], rEl: [12, 0, 0],
    lHip: [-30, 0, 6], lKnee: [6, 0, 0], rHip: [32, 0, -6], rKnee: [45, 0, 0],
    ball: 'R', gloves: false, motion: [{ j: 'lSh', a: 0, amp: 5, spd: 2 }],
  }),
  'leg-spin': P({
    hips: [0, -45, 0], spine: [8, -35, 0], head: [0, 40, 0],
    lSh: [-95, 0, 35], lEl: [-25, 0, 0], rSh: [-150, 0, -25], rEl: [-25, 0, 0],
    lHip: [-35, 0, 10], lKnee: [20, 0, 0], rHip: [25, 0, -8], rKnee: [30, 0, 0],
    ball: 'R', gloves: false, motion: [{ j: 'rEl', a: 1, amp: 12, spd: 2 }],
  }),
  'off-spin': P({
    hips: [0, -35, 0], spine: [5, -25, 0], head: [0, 30, 0],
    lSh: [-105, 0, 25], lEl: [-20, 0, 0], rSh: [-165, 0, -10], rEl: [-15, 0, 0],
    lHip: [-30, 0, 8], lKnee: [15, 0, 0], rHip: [25, 0, -8], rKnee: [28, 0, 0],
    ball: 'R', gloves: false, motion: [{ j: 'rSh', a: 2, amp: 4, spd: 1.8 }],
  }),
  'keeper-crouch': P({
    spine: [42, 0, 0], head: [-30, 0, 0],
    lSh: [-75, 0, -8], lEl: [-25, 0, 0], rSh: [-75, 0, 8], rEl: [-25, 0, 0],
    lHip: [-105, 0, 22], lKnee: [125, 0, 0], rHip: [-105, 0, -22], rKnee: [125, 0, 0],
    drop: 0.5, keeper: true, motion: [{ j: 'spine', a: 0, amp: 2, spd: 1.5 }],
  }),
  'wicket-celebration': P({
    spine: [-10, 0, 0], head: [-22, 0, 0],
    lSh: [-10, 0, 88], lEl: [0, 0, 0], rSh: [-10, 0, -88], rEl: [0, 0, 0],
    lHip: [-40, 0, 8], lKnee: [60, 0, 0], rHip: [5, 0, -4],
    gloves: false, motion: [{ j: 'hips', a: 1, amp: 12, spd: 1.2 }],
  }),
  'sword-celebration': P({
    hips: [0, -10, 0], spine: [-4, -10, 0], head: [-6, 15, 0],
    lSh: [-15, 0, 35], lEl: [-95, 0, 0], rSh: [-115, 0, -25], rEl: [-10, 0, 0],
    lHip: [-12, 0, 10], lKnee: [12, 0, 0], rHip: [5, 0, -8],
    bat: [180, 0, 0], spin: { axis: 0, speed: 6 }, oneHand: true,
  }),
  'arms-crossed': P({
    spine: [-3, 0, 0], head: [-6, 0, 0],
    lSh: [-35, -30, -10], lEl: [-115, 0, 0], rSh: [-40, 30, 10], rEl: [-110, 0, 0],
    lHip: [0, 0, 7], rHip: [0, 0, -7], gloves: false,
  }),
};

export const poseFor = key => POSE_LIBRARY[key] || POSE_LIBRARY.stand;
