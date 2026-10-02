// Curated, versioned drill library. The LLM layer may only choose from these
// entries; it may not invent drills or dosages.

import type { Drill } from "./types";

export const DRILL_LIBRARY_VERSION = "drills-0.4.0";

export interface CoachingEntry {
  metricId: string;
  /** Wording when the value is below / above the range. */
  low: { observation: string; consequence: string; cue: string };
  high: { observation: string; consequence: string; cue: string };
  drills: Drill[];
  retest: string;
}

const d = (x: Drill) => x;

export const COACHING: CoachingEntry[] = [
  {
    metricId: "head_knee_offset",
    low: {
      observation: "Your head finished behind your front knee at contact.",
      consequence: "This can leave the bat face open to the ball and make edges more likely.",
      cue: "Lead with your head: nose over the front toe.",
    },
    high: {
      observation: "Your head travelled well past your front knee at contact.",
      consequence: "Over-reaching can pull you off balance and away from the line.",
      cue: "Let the head arrive over the knee, not beyond it.",
    },
    drills: [
      d({
        id: "drill_head_lead_tee",
        name: "Head-lead tee block",
        constraint: "Ball on a low tee one stride ahead; a cone 10 cm past the tee you must not pass with your head.",
        dosage: "3 sets × 8 blocks, 30 s rest",
        passCondition: "On video, nose is over the front toe at contact in 7 of 8 reps.",
        cue: "Nose over toe, then bat.",
      }),
      d({
        id: "drill_drop_feed",
        name: "Drop-feed forward defence",
        constraint: "Partner drops a ball from shoulder height one stride ahead; play it into the ground.",
        dosage: "4 sets × 6 balls",
        passCondition: "Ball stops within 2 m of the bat on 5 of 6.",
        cue: "Head, then front foot, then bat.",
      }),
    ],
    retest: "Record 6 deliveries next session and compare head-over-knee to this report.",
  },
  {
    metricId: "stride_length",
    low: {
      observation: "Your front-foot stride was short of the ball's pitch.",
      consequence: "A short stride lets the ball move off the surface before you meet it.",
      cue: "Step to the pitch of the ball.",
    },
    high: {
      observation: "Your front-foot stride was longer than your coaching range.",
      consequence: "An over-long stride can lock the hips and slow recovery.",
      cue: "Comfortable stride; head over the knee.",
    },
    drills: [
      d({
        id: "drill_stride_markers",
        name: "Stride-marker defence",
        constraint: "Two flat markers at 0.35 and 0.45 × your height in front of your front foot; land between them.",
        dosage: "3 sets × 10 shadow strides, then 2 × 6 throw-downs",
        passCondition: "Front foot lands between the markers on 8 of 10.",
        cue: "Land soft between the lines.",
      }),
    ],
    retest: "Re-record from the same camera position; stride should move into range.",
  },
  {
    metricId: "front_knee_flexion",
    low: {
      observation: "Your hips sank below your front knee at contact.",
      consequence: "Collapsing the front knee lowers the head too far, cramps the bat and makes it hard to get back up.",
      cue: "Firm front leg; bend, don't collapse.",
    },
    high: {
      observation: "Your front leg was close to straight at contact.",
      consequence: "A straight front leg blocks the head from getting over the ball.",
      cue: "Soft front knee into the ball.",
    },
    drills: [
      d({
        id: "drill_lunge_hold",
        name: "Lunge-and-hold block",
        constraint: "Stride, block a throw-down and hold the finish for 2 s.",
        dosage: "3 sets × 6, 45 s rest",
        passCondition: "Front knee visibly bent and balanced for the full 2 s hold on 5 of 6.",
        cue: "Knee over toe, hold the shape.",
      }),
    ],
    retest: "Compare front-knee angle at contact over 6 new deliveries.",
  },
  {
    metricId: "head_speed_contact",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "Your head was still moving quickly as the ball arrived.",
      consequence: "A moving head makes late judgement of line and bounce harder.",
      cue: "Arrive early, then be still.",
    },
    drills: [
      d({
        id: "drill_still_head_catch",
        name: "Still-head short catches",
        constraint: "From your batting stance, step forward and catch underarm feeds at knee height without the head bobbing.",
        dosage: "3 sets × 10 catches",
        passCondition: "Partner sees no head bob on 8 of 10.",
        cue: "Eyes level, head quiet.",
      }),
    ],
    retest: "Check head stillness at contact on your next 6 deliveries.",
  },
  {
    metricId: "bat_angle_contact",
    low: {
      observation: "Your bat was close to upright at contact, with the hands level with or behind the blade.",
      consequence: "An upright bat can push the ball in the air instead of down into the ground.",
      cue: "Hands ahead of the blade; angle the bat down.",
    },
    high: {
      observation: "Your bat was tilted well forward at contact.",
      consequence: "A bat angled too far reaches for the ball and narrows the face it meets.",
      cue: "Top hand leads; let the ball come to the bat.",
    },
    drills: [
      d({
        id: "drill_top_hand_only",
        name: "Top-hand-only defence",
        constraint: "Bottom hand off the bat; block soft throw-downs with the top hand only.",
        dosage: "3 sets × 8 balls",
        passCondition: "Bat face straight and ball dropped in front on 6 of 8.",
        cue: "Top hand in control.",
      }),
    ],
    retest: "Bat angle at contact on 6 new deliveries.",
  },
  {
    metricId: "bat_speed_contact",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "The bat was still travelling fast at contact.",
      consequence: "Pushing at the ball sends edges further and to catchers.",
      cue: "Soft hands; let the ball come to the bat.",
    },
    drills: [
      d({
        id: "drill_soft_hands_cone",
        name: "Soft-hands cone drop",
        constraint: "Defend throw-downs so the ball stops inside a cone circle 2 m in front.",
        dosage: "4 sets × 6 balls",
        passCondition: "Ball stops inside the circle on 5 of 6.",
        cue: "Catch it with the bat.",
      }),
    ],
    retest: "Bat speed at contact and ball exit speed on 6 new deliveries.",
  },
  {
    metricId: "ball_exit_speed",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "The ball left the bat faster than a controlled defence.",
      consequence: "Hard hands give catches; a dead ball protects the stumps and the outside edge.",
      cue: "Grip lighter in the bottom hand.",
    },
    drills: [
      d({
        id: "drill_soft_hands_cone_exit",
        name: "Soft-hands cone drop",
        constraint: "Defend throw-downs so the ball stops inside a cone circle 2 m in front.",
        dosage: "4 sets × 6 balls",
        passCondition: "Ball stops inside the circle on 5 of 6.",
        cue: "Catch it with the bat.",
      }),
    ],
    retest: "Ball speed off the bat on 6 new deliveries.",
  },
  {
    metricId: "weight_forward",
    low: {
      observation: "Your weight stayed toward the back foot at contact.",
      consequence: "Weight back tends to lift the head and the bat face.",
      cue: "Transfer into the front foot as the ball arrives.",
    },
    high: {
      observation: "Your weight was right over or past the front foot.",
      consequence: "Leaning past the base can tip you over and slow recovery.",
      cue: "Weight into the front foot, not over it.",
    },
    drills: [
      d({
        id: "drill_back_foot_lift",
        name: "Back-heel lift defence",
        constraint: "After contact, lift the back heel and hold balance for 2 s.",
        dosage: "3 sets × 8",
        passCondition: "Balanced 2 s hold on 7 of 8.",
        cue: "Front foot carries you.",
      }),
    ],
    retest: "Weight over front foot on 6 new deliveries.",
  },
  {
    metricId: "trunk_inclination",
    low: {
      observation: "Your trunk stayed upright at contact.",
      consequence: "An upright trunk keeps the head back from the ball.",
      cue: "Lean in from the hips.",
    },
    high: {
      observation: "You were bent well forward at contact, chest close to the thigh.",
      consequence: "Folding over narrows the base and can drag the head across the line.",
      cue: "Chest proud, head forward.",
    },
    drills: [
      d({
        id: "drill_mirror_shadow",
        name: "Mirror shadow defence",
        constraint: "Shadow the defence side-on to a mirror; freeze at contact and check trunk angle.",
        dosage: "3 sets × 10",
        passCondition: "Freeze-frame trunk angle within range on 8 of 10.",
        cue: "Hips back, head forward.",
      }),
    ],
    retest: "Trunk lean on 6 new deliveries.",
  },
  {
    metricId: "foot_spread",
    low: {
      observation: "Your feet were close together: the front foot hadn't gone far toward the ball.",
      consequence: "Without a stride the ball can move off the pitch before it reaches the bat.",
      cue: "Step to the pitch of the ball.",
    },
    high: {
      observation: "Your feet were stretched very wide apart.",
      consequence: "Over-stretching locks the hips and makes it hard to stay balanced.",
      cue: "A long stride you can hold, head over the knee.",
    },
    drills: [
      d({
        id: "drill_stride_markers",
        name: "Stride-marker defence",
        constraint: "Two flat markers at 0.35 and 0.45 × your height in front of your front foot; land between them.",
        dosage: "3 sets × 10 shadow strides, then 2 × 6 throw-downs",
        passCondition: "Front foot lands between the markers on 8 of 10.",
        cue: "Land soft between the lines.",
      }),
    ],
    retest: "Take the same side-on photo, or record a clip, at the moment of contact.",
  },
  {
    metricId: "back_knee_extension",
    low: {
      observation: "Your back knee was well bent at contact.",
      consequence: "A bent back leg keeps weight back and the head behind the ball.",
      cue: "Push off the back foot; let the back leg go long.",
    },
    high: { observation: "", consequence: "", cue: "" },
    drills: [
      d({
        id: "drill_long_back_leg",
        name: "Long-back-leg shadow",
        constraint: "Shadow the defence and freeze at contact: back leg long, back heel off the ground, toe still touching.",
        dosage: "3 sets × 8, freeze 2 s each",
        passCondition: "Back leg long and heel up at the freeze on 7 of 8.",
        cue: "Heel up, leg long.",
      }),
    ],
    retest: "Back leg at contact on a new side-on photo or clip.",
  },
  {
    metricId: "hands_ahead_of_knee",
    low: {
      observation: "Your hands were level with or behind your front knee at contact.",
      consequence: "With the hands back, the bat face points up and the ball can pop up to close fielders.",
      cue: "Hands over the front pad, bat angled down.",
    },
    high: {
      observation: "Your hands were pushed well out in front of your front knee.",
      consequence: "Pushing at the ball with hard hands sends edges to the slips.",
      cue: "Soft hands; let the ball come to you.",
    },
    drills: [
      d({
        id: "drill_top_hand_only",
        name: "Top-hand-only defence",
        constraint: "Bottom hand off the bat; block soft throw-downs with the top hand only.",
        dosage: "3 sets × 8 balls",
        passCondition: "Bat angled down and ball dropped in front on 6 of 8.",
        cue: "Top hand in control.",
      }),
    ],
    retest: "Hand position at contact on a new side-on photo or clip.",
  },
  {
    metricId: "contact_ahead_of_knee",
    low: {
      observation: "You met the ball behind your front pad.",
      consequence: "Late contact lets movement off the pitch beat the bat.",
      cue: "Meet it beside the front pad.",
    },
    high: {
      observation: "You met the ball well in front of your front pad.",
      consequence: "Reaching for the ball opens a gap between bat and pad.",
      cue: "Let the ball come under your eyes.",
    },
    drills: [
      d({
        id: "drill_gate_block",
        name: "Gate block",
        constraint: "Two cones either side of the contact zone beside the front pad; block balls through the gate.",
        dosage: "3 sets × 8 throw-downs",
        passCondition: "Contact inside the gate on 6 of 8.",
        cue: "Bat and pad together.",
      }),
    ],
    retest: "Contact point vs front knee on 6 new deliveries.",
  },
  {
    metricId: "decision_timing",
    low: {
      observation: "Your front foot moved very early, well before the ball bounced.",
      consequence: "Pre-committing can leave you stuck forward to a shorter ball.",
      cue: "Stay balanced until you pick the length.",
    },
    high: {
      observation: "Your front foot moved after the ball had already bounced.",
      consequence: "A late decision leaves less time to get the head over the ball.",
      cue: "Pick length from the hand, move on release.",
    },
    drills: [
      d({
        id: "drill_length_call",
        name: "Length-call throw-downs",
        constraint: "Call 'up' or 'back' out loud on release, then play the matching shot.",
        dosage: "4 sets × 6 mixed lengths",
        passCondition: "Correct call and movement before bounce on 5 of 6.",
        cue: "Call it on release.",
      }),
    ],
    retest: "Decision timing on 6 new deliveries with a visible bounce.",
  },
  // Graded when filmed from the bowler's end or behind the batter.
  {
    metricId: "head_falling_away",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "Your head was on the leg side of your front foot at contact: falling away from the ball.",
      consequence: "Falling away takes your eyes off the line of the ball and opens the face of the bat.",
      cue: "Head to the ball, over the front foot.",
    },
    drills: [
      d({
        id: "drill_line_tape",
        name: "Line-tape forward defence",
        constraint: "A strip of tape on the pitch along the line of the stumps; front foot lands beside it, head stays over it.",
        dosage: "3 sets × 8 balls, 30 s rest",
        passCondition: "Filmed from the bowler's end, the head is over the front foot or toward the ball at contact on 7 of 8.",
        cue: "Head to the line, then the foot.",
      }),
      d({
        id: "drill_eyes_level",
        name: "Eyes-level shadow defence",
        constraint: "Shadow the defence facing a mirror or a partner; a cap peak must stay level through the stride.",
        dosage: "3 sets × 10 shadows",
        passCondition: "Partner sees no head tilt or sway on 9 of 10.",
        cue: "Still head, level eyes.",
      }),
    ],
    retest: "Film 6 deliveries from the bowler's end and compare head position to this report.",
  },
  {
    metricId: "balance_over_feet",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "Your weight was outside your feet at contact.",
      consequence: "Off balance, the bat follows the body instead of the ball, and you can't hold the shot.",
      cue: "Weight over the front foot, hold the finish.",
    },
    drills: [
      d({
        id: "drill_hold_finish",
        name: "Hold-the-finish defence",
        constraint: "Throw-downs on a full length; after each defence hold the position, back toe grounded, for a two-second count.",
        dosage: "3 sets × 8 balls, 30 s rest",
        passCondition: "Held still for two seconds without a step on 7 of 8.",
        cue: "Freeze for two.",
      }),
      d({
        id: "drill_narrow_base",
        name: "Stride-to-the-line drill",
        constraint: "Cones on a good length on off, middle and leg; the feeder calls a cone, the front foot strides to its line.",
        dosage: "3 sets × 9 strides",
        passCondition: "Front foot lands on the called line with the head over it on 8 of 9.",
        cue: "Foot to the line, head over the foot.",
      }),
    ],
    retest: "Film 6 deliveries from the bowler's end and compare balance to this report.",
  },
];

export const coachingFor = (metricId: string) => COACHING.find((c) => c.metricId === metricId);
