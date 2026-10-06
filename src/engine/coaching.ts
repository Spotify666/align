// Curated, versioned drill library. The LLM layer may only choose from these
// entries; it may not invent drills or dosages.

import type { Drill } from "./types";

export const DRILL_LIBRARY_VERSION = "drills-0.5.0";

type Wording = { observation: string; consequence: string; cue: string };

export interface CoachingEntry {
  metricId: string;
  /** Wording when the value is below / above the range. */
  low: Wording;
  high: Wording;
  /** The line read from either end of the pitch: the same fault seen sideways. */
  sideways?: { low: Wording; high: Wording };
  /** Easiest first: shadow, static or dropped ball, throw-downs, machine or live. */
  drills: Drill[];
  retest: string;
}

/** The wording for a metric outside its range, for the axis it was read along. */
export function wordingFor(entry: CoachingEntry, side: "low" | "high", axis?: "forward" | "sideways"): Wording {
  return (axis === "sideways" && entry.sideways?.[side]) || entry[side];
}

const d = (x: Drill) => x;

export const COACHING: CoachingEntry[] = [
  // ----- The line: head, front shoulder and front knee over the front foot, to contact -----
  {
    metricId: "line_head",
    low: {
      observation: "Your head was behind your front foot at contact.",
      consequence: "With the head back, the ball is met in front of your eyes: it goes in the air or finds the edge.",
      cue: "Nose over the front toe.",
    },
    high: {
      observation: "Your head went well past your front foot.",
      consequence: "Reaching beyond the foot tips you forward, so the bat can't come down straight under the eyes.",
      cue: "Head over the toe, not beyond it.",
    },
    sideways: {
      low: {
        observation: "Your head was on the leg side of the line at contact: falling away from the ball.",
        consequence: "Falling away takes the eyes off the line and drags the bat across it: edges to the slips.",
        cue: "Head to the ball, over the front foot.",
      },
      high: {
        observation: "Your head leaned too far to the off side, past the line of the ball.",
        consequence: "Reaching across overbalances you to the off side and plays you around the front pad.",
        cue: "Head over the ball, not across it.",
      },
    },
    drills: [
      d({
        id: "drill_nose_over_toe",
        level: 1,
        name: "Nose-over-toe freeze",
        constraint: "Shadow the stride in front of a mirror or your phone camera. Freeze where the bat would meet the ball.",
        dosage: "3 sets × 10 shadows",
        passCondition: "In the freeze, your nose is straight above your front toe (side-on) or just outside it, over the ball's line (front-on) on 9 of 10.",
        cue: "Nose over toe.",
      }),
      d({
        id: "drill_head_lead_tee",
        level: 2,
        name: "Head-lead tee block",
        constraint: "Ball on a low tee one stride ahead; a cone 10 cm past the tee you must not pass with your head.",
        dosage: "3 sets × 8 blocks, 30 s rest",
        passCondition: "On video, the head is over the ball at contact in 7 of 8 reps.",
        cue: "Nose over toe, then bat.",
      }),
      d({
        id: "drill_drop_feed",
        level: 3,
        name: "Drop-feed forward defence",
        constraint: "Partner drops a ball from shoulder height one stride ahead; play it into the ground.",
        dosage: "4 sets × 6 balls",
        passCondition: "Ball stops within 2 m of the bat on 5 of 6, head over it at contact.",
        cue: "Head, then front foot, then bat.",
      }),
      d({
        id: "drill_line_throwdowns",
        level: 4,
        name: "Throw-downs to a line",
        constraint: "Throw-downs (then a machine) on a good length just outside off stump; a strip of tape on the line of off stump. Head goes over the tape.",
        dosage: "4 sets × 6 balls at rising pace",
        passCondition: "Filmed, the head is in line at contact on 5 of 6, with the ball dying within 2 m.",
        cue: "Head to the line, then play.",
      }),
    ],
    retest: "Film 6 deliveries from the same camera position; the head should be in line on 5 of 6.",
  },
  {
    metricId: "line_shoulder",
    low: {
      observation: "Your front shoulder stayed behind your front foot at contact.",
      consequence: "A shoulder left behind keeps the weight back: the bat comes through at an angle and the ball pops up.",
      cue: "Front shoulder leads to the ball.",
    },
    high: {
      observation: "Your front shoulder went past your front foot.",
      consequence: "Over-leaning tips you forward and drags the bat across the ball.",
      cue: "Shoulder over the knee, then stop.",
    },
    sideways: {
      low: {
        observation: "Your front shoulder swung toward the leg side: opening up before contact.",
        consequence: "An open front shoulder swings the bat across the line of the ball instead of down it.",
        cue: "Point the front shoulder down the line of the ball.",
      },
      high: {
        observation: "Your front shoulder dived across to the off side.",
        consequence: "Diving across plays you around the front pad and off balance.",
        cue: "Shoulder over the foot, foot to the line.",
      },
    },
    drills: [
      d({
        id: "drill_top_hand_shadow",
        level: 1,
        name: "Top-hand shadow",
        constraint: "Shadow the defence holding the bat in the top hand only, front shoulder pointing at a cone placed down the line of off stump.",
        dosage: "3 sets × 10 shadows",
        passCondition: "At the freeze the front shoulder points at the cone and sits over the front foot on 9 of 10.",
        cue: "Shoulder to the cone.",
      }),
      d({
        id: "drill_top_hand_drop",
        level: 2,
        name: "Top-hand drop feed",
        constraint: "Partner drops a ball one stride ahead; defend it with the top hand only, front elbow high.",
        dosage: "3 sets × 8 balls",
        passCondition: "Bat face straight and the ball dying within 2 m on 6 of 8.",
        cue: "Front elbow up, shoulder leads.",
      }),
      d({
        id: "drill_bottom_hand_light",
        level: 3,
        name: "Light-bottom-hand throw-downs",
        constraint: "Throw-downs on a good length; the bottom hand holds the handle with thumb and first finger only, so the front shoulder and top hand do the work.",
        dosage: "4 sets × 6 balls",
        passCondition: "Filmed, the front shoulder is over the front foot at contact on 5 of 6.",
        cue: "Top hand and shoulder lead.",
      }),
      d({
        id: "drill_line_machine",
        level: 4,
        name: "Shoulder-to-the-line machine work",
        constraint: "Bowling machine on a good length outside off, building pace each set; a cone down the line of off stump.",
        dosage: "4 sets × 6 balls, rising pace",
        passCondition: "Filmed, the shoulder is in line at contact on 5 of 6 at your fastest set.",
        cue: "Shoulder down the line.",
      }),
    ],
    retest: "Film 6 deliveries from the same camera position; the front shoulder should be in line on 5 of 6.",
  },
  {
    metricId: "line_knee",
    low: {
      observation: "Your front knee was behind your front foot: a straight, propped front leg.",
      consequence: "With the front leg straight the weight can't go forward; the head stays back and the ball is played at arm's length.",
      cue: "Bend the front knee over the toe.",
    },
    high: {
      observation: "Your front knee went well past your toe.",
      consequence: "A collapsing knee drops the head too low and leaves you stuck on the front foot.",
      cue: "Knee over toe, firm base.",
    },
    sideways: {
      low: {
        observation: "Your front knee fell in toward the leg side.",
        consequence: "A knee falling in takes the base off the line, and the bat follows it.",
        cue: "Knee over the foot, pointing at the bowler.",
      },
      high: {
        observation: "Your front knee pushed out to the off side.",
        consequence: "It tips the base outward and puts the front pad in the bat's way.",
        cue: "Knee over the foot.",
      },
    },
    drills: [
      d({
        id: "drill_knee_lunge_hold",
        level: 1,
        name: "Knee-over-toe lunge hold",
        constraint: "Stride to a marker one stride ahead and hold the defence for 3 s; a stick upright at the front toe shows where the knee should be.",
        dosage: "3 sets × 8 holds",
        passCondition: "Knee touches the stick's line, not past it, on 7 of 8, no wobble.",
        cue: "Knee to the stick.",
      }),
      d({
        id: "drill_bent_knee_drop",
        level: 2,
        name: "Bent-knee drop feed",
        constraint: "Partner drops a ball one stride ahead; you must play it with the front knee bent over the toe.",
        dosage: "3 sets × 8 balls",
        passCondition: "On video, knee over the front foot at contact on 6 of 8.",
        cue: "Soft front knee.",
      }),
      d({
        id: "drill_stride_markers_knee",
        level: 3,
        name: "Stride-marker defence",
        constraint: "Two flat markers at 0.35 and 0.45 × your height in front of your front foot; land between them.",
        dosage: "3 sets × 10 shadow strides, then 2 × 6 throw-downs",
        passCondition: "Front foot lands between the markers, knee over it, on 8 of 10.",
        cue: "Land soft between the lines.",
      }),
      d({
        id: "drill_knee_machine",
        level: 4,
        name: "Firm-base machine work",
        constraint: "Bowling machine on a full and a good length, alternating; land and hold for a count of one after each ball.",
        dosage: "4 sets × 6 balls",
        passCondition: "Filmed, the knee is over the front foot at contact on 5 of 6.",
        cue: "Land, bend, hold.",
      }),
    ],
    retest: "Film 6 deliveries from the same camera position; the front knee should be in line on 5 of 6.",
  },
  {
    metricId: "line_held",
    low: {
      observation: "Your line wasn't held from the front foot's landing to contact.",
      consequence: "With the head or shoulder still moving as the ball arrives, you play it on the move: late, and off the line.",
      cue: "Land, set, then play.",
    },
    high: { observation: "", consequence: "", cue: "" },
    drills: [
      d({
        id: "drill_freeze_clap",
        level: 1,
        name: "Freeze on the clap",
        constraint: "Shadow the defence; a partner claps at the moment the bat would meet the ball. Freeze on the clap and check the line on video.",
        dosage: "3 sets × 10 shadows",
        passCondition: "Head, front shoulder and front knee already in line on the clap on 9 of 10.",
        cue: "Set before the clap.",
      }),
      d({
        id: "drill_hold_finish_line",
        level: 2,
        name: "Hold-the-finish defence",
        constraint: "Drop feeds then throw-downs on a full length; after each defence hold the position, back toe grounded, for a two-second count.",
        dosage: "3 sets × 8 balls, 30 s rest",
        passCondition: "Held still for two seconds without a step on 7 of 8.",
        cue: "Freeze for two.",
      }),
      d({
        id: "drill_line_throwdowns_hold",
        level: 3,
        name: "Line-and-hold throw-downs",
        constraint: "Throw-downs on a good length; a tape line on the line of off stump. Land, play, and hold over the tape until the ball stops.",
        dosage: "4 sets × 6 balls",
        passCondition: "Filmed, in line from landing to contact on 5 of 6.",
        cue: "Land, set, play, hold.",
      }),
    ],
    retest: "Film 6 deliveries; the line should be held from landing to contact on 5 of 6.",
  },
  {
    metricId: "sync_spread",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "Your front foot, front knee and front shoulder arrived at different times.",
      consequence: "When one part arrives early and another late, the line is built in pieces and breaks against pace or movement.",
      cue: "Foot, knee, shoulder: together.",
    },
    drills: [
      d({
        id: "drill_one_count",
        level: 1,
        name: "One-count shadow",
        constraint: "Shadow to a metronome (60 bpm): on one beat the foot lands, the knee bends and the shoulder arrives over it, all together.",
        dosage: "3 sets × 10 shadows",
        passCondition: "Filmed at 60 fps or more, all three arrive within 100 ms on 8 of 10.",
        cue: "One beat: land, bend, lean.",
      }),
      d({
        id: "drill_drop_on_landing",
        level: 2,
        name: "Drop on landing",
        constraint: "Partner holds a ball at shoulder height one stride ahead and drops it as your front foot lands; defend it.",
        dosage: "3 sets × 8 balls",
        passCondition: "Front knee and shoulder set as the foot lands, ball dying within 2 m, on 6 of 8.",
        cue: "Land into the shot.",
      }),
      d({
        id: "drill_bounce_cue",
        level: 3,
        name: "Land-on-bounce throw-downs",
        constraint: "Throw-downs on a good length: the front foot lands as the ball bounces, and the knee and shoulder land with it.",
        dosage: "4 sets × 6 balls",
        passCondition: "Filmed, foot, knee and shoulder within 150 ms of each other on 5 of 6.",
        cue: "Bounce, land, set.",
      }),
    ],
    retest: "Film 6 deliveries (60 fps or slow motion if you can); foot, knee and shoulder should arrive within 150 ms of each other.",
  },
  {
    metricId: "set_late",
    low: { observation: "", consequence: "", cue: "" },
    high: {
      observation: "Part of your body was still moving into position after the bat met the ball.",
      consequence: "Set after contact means the ball decided your position, not you: late on anything quicker or moving.",
      cue: "Be set before the ball arrives.",
    },
    drills: [
      d({
        id: "drill_early_set_shadow",
        level: 1,
        name: "Early-set shadow",
        constraint: "On a partner's 'go', stride into the defence; they clap 0.3 s later. Be still before the clap.",
        dosage: "3 sets × 10 shadows",
        passCondition: "Still before the clap on 9 of 10.",
        cue: "Set, then the clap.",
      }),
      d({
        id: "drill_bounce_cue_drop",
        level: 2,
        name: "Bounce-cue drop feed",
        constraint: "Partner drops the ball from head height one stride ahead; your front foot must land before it bounces.",
        dosage: "3 sets × 8 balls",
        passCondition: "Foot down before the bounce and the ball dying within 2 m on 6 of 8.",
        cue: "Down before the bounce.",
      }),
      d({
        id: "drill_length_call",
        level: 3,
        name: "Length-call throw-downs",
        constraint: "Call 'up' or 'back' out loud on release, then play the matching shot.",
        dosage: "4 sets × 6 mixed lengths",
        passCondition: "Correct call and movement before bounce on 5 of 6.",
        cue: "Call it on release.",
      }),
      d({
        id: "drill_machine_pace",
        level: 4,
        name: "Machine at rising pace",
        constraint: "Bowling machine on a good length; start comfortable and raise the speed each set only when the previous set passes.",
        dosage: "4 sets × 6 balls",
        passCondition: "Filmed, set before contact on 5 of 6 at each speed.",
        cue: "Set early, play late.",
      }),
    ],
    retest: "Film 6 deliveries; everything should be set by contact on 5 of 6.",
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
