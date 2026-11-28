/**
 * Football signature poses for the shared rigged human (same conventions as src/sports/cricket/poses.js:
 * degrees, Euler XYZ, character faces +Z, left = +X; written for a right-footer, mirrored for left-footers).
 * football: 'R' | 'L' puts a ball at that foot, 'head' above the head, 'hands' between the gloves.
 */
import { registerPoses } from '../cricket/poses.js';

registerPoses({
  shoot: {
    hips: [0, 25, 0], spine: [-14, 15, 0], head: [8, -12, 0],
    lSh: [-35, 0, 72], lEl: [-25, 0, 0], rSh: [15, 0, -50], rEl: [-20, 0, 0],
    lHip: [-8, 0, 8], lKnee: [18, 0, 0], rHip: [-78, 0, -4], rKnee: [8, 0, 0],
    gloves: false, football: 'R', drop: 0.04, motion: [{ j: 'rHip', a: 0, amp: 4, spd: 2 }],
  },
  pass: {
    hips: [0, 10, 0], spine: [8, 10, 0], head: [12, -10, 0],
    lSh: [-15, 0, 45], lEl: [-30, 0, 0], rSh: [5, 0, -35], rEl: [-25, 0, 0],
    lHip: [-8, 0, 8], lKnee: [20, 0, 0], rHip: [-38, 35, -12], rKnee: [28, 0, 0],
    gloves: false, football: 'R', drop: 0.04,
  },
  dribble: {
    spine: [18, 0, 0], head: [12, 0, 0],
    lSh: [28, 0, 22], lEl: [-65, 0, 0], rSh: [-42, 0, -20], rEl: [-75, 0, 0],
    lHip: [28, 0, 6], lKnee: [65, 0, 0], rHip: [-38, 0, -6], rKnee: [42, 0, 0],
    gloves: false, football: 'R', drop: 0.06, motion: [{ j: 'spine', a: 1, amp: 5, spd: 2.2 }, { j: 'lSh', a: 0, amp: 10, spd: 2.2 }],
  },
  header: {
    spine: [-16, 0, 0], head: [-28, 0, 0],
    lSh: [-55, 0, 62], lEl: [-65, 0, 0], rSh: [-55, 0, -62], rEl: [-65, 0, 0],
    lHip: [-30, 0, 8], lKnee: [75, 0, 0], rHip: [-8, 0, -8], rKnee: [55, 0, 0],
    gloves: false, football: 'head', drop: -0.3,
  },
  'bicycle-kick': {
    hips: [-95, 0, 0], spine: [8, 0, 0], head: [25, 0, 0],
    lSh: [-20, 0, 85], lEl: [-10, 0, 0], rSh: [-20, 0, -85], rEl: [-10, 0, 0],
    lHip: [-35, 0, 10], lKnee: [80, 0, 0], rHip: [-150, 0, -6], rKnee: [12, 0, 0],
    gloves: false, football: 'R', drop: -0.55,
  },
  'knee-slide': {
    spine: [-24, 0, 0], head: [-26, 0, 0],
    lSh: [-160, 0, 42], lEl: [-12, 0, 0], rSh: [-160, 0, -42], rEl: [-12, 0, 0],
    lHip: [0, 0, 12], lKnee: [110, 0, 0], rHip: [0, 0, -12], rKnee: [110, 0, 0],
    gloves: false, drop: 0.46, motion: [{ j: 'spine', a: 0, amp: 3, spd: 1.4 }],
  },
  'siu-jump': {
    hips: [0, 0, 0], spine: [-8, 0, 0], head: [-16, 0, 0],
    lSh: [12, 0, 48], lEl: [-8, 0, 0], rSh: [12, 0, -48], rEl: [-8, 0, 0],
    lHip: [-4, 0, 12], lKnee: [8, 0, 0], rHip: [-4, 0, -12], rKnee: [8, 0, 0],
    gloves: false, drop: -0.38, motion: [{ j: 'hips', a: 1, amp: 8, spd: 1.2 }],
  },
  'arms-wide': {
    spine: [-10, 0, 0], head: [-20, 0, 0],
    lSh: [-10, 0, 86], lEl: [0, 0, 0], rSh: [-10, 0, -86], rEl: [0, 0, 0],
    lHip: [-42, 0, 8], lKnee: [62, 0, 0], rHip: [12, 0, -4], rKnee: [12, 0, 0],
    gloves: false, motion: [{ j: 'hips', a: 1, amp: 10, spd: 1.2 }],
  },
  'free-kick': {
    spine: [4, 0, 0], head: [8, 0, 0],
    lSh: [22, 25, 42], lEl: [-95, 0, 0], rSh: [22, -25, -42], rEl: [-95, 0, 0],
    lHip: [-4, 0, 9], lKnee: [6, 0, 0], rHip: [4, 0, -9], rKnee: [6, 0, 0],
    gloves: false, football: 'R', motion: [{ j: 'head', a: 1, amp: 6, spd: 0.8 }],
  },
  'keeper-dive': {
    hips: [0, 0, 72], spine: [0, 0, 4], head: [0, 0, -10],
    lSh: [-172, 0, 12], lEl: [0, 0, 0], rSh: [-172, 0, -12], rEl: [0, 0, 0],
    lHip: [-18, 0, 16], lKnee: [28, 0, 0], rHip: [12, 0, -10], rKnee: [24, 0, 0],
    gloves: false, keeperGloves: true, football: 'hands', drop: -0.42,
  },
  'keeper-catch': {
    spine: [12, 0, 0], head: [6, 0, 0],
    lSh: [-62, 0, 14], lEl: [-72, 0, 0], rSh: [-62, 0, -14], rEl: [-72, 0, 0],
    lHip: [-14, 0, 12], lKnee: [24, 0, 0], rHip: [-14, 0, -12], rKnee: [24, 0, 0],
    gloves: false, keeperGloves: true, football: 'hands', drop: 0.06,
  },
  tackle: {
    hips: [0, 0, 0], spine: [-38, 0, 0], head: [-10, 0, 0],
    lSh: [35, 0, 42], lEl: [-10, 0, 0], rSh: [-45, 0, -62], rEl: [-20, 0, 0],
    lHip: [-82, 0, 10], lKnee: [6, 0, 0], rHip: [-18, 0, -10], rKnee: [112, 0, 0],
    gloves: false, football: 'L', drop: 0.6,
  },
});
