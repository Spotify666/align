// The screen map (/design): every flow through Aline as the screens a person meets, in order.
// One source for the page, its print layout and the PDF made from it (scripts/design/). Pure
// data: the pictures are captures of the app itself on generated examples and test accounts
// (scripts/design/capture.mjs), never a real player's footage. `tests/screen-map.test.ts` holds
// it together: every step names a screen, every screen has its picture and is used, every
// address is a real page.

export interface Screen {
  id: string;
  name: string;
  /** The address as shown ("/check", or where it opens from). */
  route: string;
  /** Where "Open this page" goes; null when the screen needs an account, a pairing or a saved shot. */
  href: string | null;
  /** What the screen is for, in one sentence. */
  says: string;
  /** What each thing on it does. */
  options: Array<[label: string, does: string]>;
  /** How the picture was made, when it isn't simply the page as anyone sees it. */
  captured?: string;
}

export interface Flow {
  id: string;
  name: string;
  who: string;
  /** What the person has at the end of it. */
  goal: string;
  steps: string[];
  /** Said under the flow: what isn't proven, or what it needs. */
  note?: string;
}

const TEST_ACCOUNT = "Captured with a test account; the names are made up.";

export const SCREENS: Screen[] = [
  // ---------- First visit ----------
  {
    id: "landing-1", name: "Landing", route: "/", href: "/",
    says: "Says what Aline is in one line and shows a real batter, traced from a clip, playing the shot.",
    options: [
      ["Check your shot", "The one main action. Opens the capture screen."],
      ["See a sample result", "A full example report, without filming anything."],
      ["Stance, Backlift, Stride, Contact", "Stops the traced batter on that moment."],
    ],
  },
  {
    id: "landing-2", name: "What comes back", route: "/", href: "/",
    says: "A real result from the engine: the shot, what was good, what to fix, and the line as Aline read it.",
    options: [
      ["Open the full sample", "The whole report for this example."],
      ["The line", "Head, front shoulder and front knee over the front foot, each against its range."],
    ],
  },
  {
    id: "landing-3", name: "Levels", route: "/#levels", href: "/#levels",
    says: "Beginner, Amateur and Professional change the words and how much is shown, never the measurement.",
    options: [
      ["Three levels", "Chosen when you check a shot, or in your profile."],
      ["For players, for coaches", "What each gets, and the way in to each."],
    ],
  },
  {
    id: "landing-4", name: "What is true today", route: "/", href: "/",
    says: "Straight answers: what is graded, what stays on the phone, what works best, and what is still experimental.",
    options: [
      ["Graded, On your phone, Works best, Experimental", "Four plain statements, kept up to date."],
      ["How the analysis works", "Opens the Science page."],
    ],
  },
  {
    id: "samples", name: "Sample reports", route: "/sample", href: "/sample",
    says: "One example of every answer Aline can give, made by the engine from generated movement.",
    options: [["A sample", "Opens that report. Every one is marked DEMO DATA."]],
  },

  // ---------- Check a shot ----------
  {
    id: "home", name: "Home", route: "/home", href: "/home",
    says: "Where the app starts: check a shot, see your last result and the one thing to work on.",
    options: [
      ["Check your shot", "Opens the capture screen."],
      ["Your last shot", "The last result in one sentence, what to work on next, and how many shots you have checked."],
      ["How to film", "Opens the guide."],
      ["What Aline reads", "A real front-foot defence played on Aline's figure, with the line it reads through head, shoulder, knee and toe."],
    ],
  },
  {
    id: "check-1", name: "Check your shot", route: "/check", href: "/check",
    says: "Choose how the report should talk to you. Nothing here is required.",
    options: [
      ["Analysis level", "Beginner: plain words, no numbers. Amateur: cricket terms. Professional: every check with its value and target."],
      ["Which shot?", "Aline tells by default. Naming a shot only records what you meant to play; it never changes the answer."],
      ["Your age", "Optional. Used for wording only when no level is chosen."],
    ],
  },
  {
    id: "check-2", name: "Focus areas", route: "/check", href: "/check",
    says: "Pick what you care about and those checks come first in your report.",
    options: [
      ["Eight areas", "Alignment, footwork, balance, bat path, hands, timing, outcome, a reference."],
      ["Never hides a fault", "A serious finding outside your focus is still shown."],
    ],
  },
  {
    id: "check-3", name: "Ways in", route: "/check", href: "/check",
    says: "Give Aline the shot: a video for the full analysis, or photos to check one position.",
    options: [
      ["Upload a video", "The full movement analysis, with timing."],
      ["Per-frame form check", "Up to 12 photos. A photo can't show timing, the ball or which shot was played."],
      ["Record a shot, Take a photo", "Opens the phone's own camera."],
      ["Dual-angle capture", "Two videos of the same ball."],
    ],
  },
  {
    id: "lineup", name: "Line up the camera", route: "/check, Line up the camera first", href: "/check",
    says: "Puts the phone in the right place before recording. Guidance only: it never blocks you.",
    options: [
      ["Frame and foot line", "The whole batter inside the frame, the feet on the line."],
      ["Checks", "Phone turned the right way, batter in view, a usable size, one person, the phone level."],
      ["Record now", "Opens the phone's camera app, which records better than a web page can."],
    ],
    captured: "The green picture is the browser's test camera standing in for a phone's.",
  },
  {
    id: "check-film", name: "How to film", route: "/check, How to film", href: "/check",
    says: "A plan of the pitch, to scale, with the two places Aline reads from.",
    options: [
      ["From the side", "6 to 8 metres square of the crease, at hip height."],
      ["From the bowler's end", "Straight behind the bowler's stumps."],
    ],
  },
  {
    id: "report-1", name: "The answer", route: "/report/…", href: "/sample/valid_ffd",
    says: "The result first, in at most five plain sentences, with the camera angle beside it.",
    options: [
      ["The sentences", "What was good, what to fix, and one cue to remember."],
      ["Five sections", "Evidence, Training, Comparison, Progress, Technical details: closed until you open one."],
      ["PDF", "The report laid out for paper."],
      ["Record again", "Check another attempt."],
    ],
  },

  // ---------- Read the report ----------
  {
    id: "report-evidence", name: "Evidence", route: "report, Evidence", href: "/sample/valid_ffd",
    says: "Why Aline said what it said: the strongest point, the one fix, and the frames themselves.",
    options: [
      ["Your checks", "The checks for your level and focus areas."],
      ["The line", "Head, shoulder and knee over the front foot until contact."],
      ["Evidence viewer", "The tracked body frame by frame. Parts the camera didn't see are not drawn."],
    ],
  },
  {
    id: "report-training", name: "Training", route: "report, Training", href: "/sample/valid_ffd",
    says: "Turns the result into practice: a short lesson drawn from your own tracked points, then a drill ladder.",
    options: [
      ["The lesson", "One chapter per finding. Dotted where the tracker was unsure."],
      ["Drill ladder", "Shadow, then a dropped ball, then throw-downs, then machine or live, each with a pass condition."],
    ],
  },
  {
    id: "report-comparison", name: "Comparison", route: "report, Comparison", href: "/sample/valid_ffd",
    says: "How close this shot is to a reference, only when the two can fairly be compared.",
    options: [
      ["Movement similarity", "A score by part of the body: the line, timing, footwork, balance, hands and bat."],
      ["Not comparable", "Says why (another shot, another camera position, too few measures) and what would make it so."],
      ["Where it comes from", "Every reference says whose it is: yours, generated, research, or licensed."],
    ],
  },
  {
    id: "report-progress", name: "Progress", route: "report, Progress", href: "/sample/valid_ffd",
    says: "This shot against your own usual, measure by measure, with what changed first.",
    options: [["Your usual", "The middle of your earlier shots filmed the same way."]],
  },
  {
    id: "report-technical", name: "Technical details", route: "report, Technical details", href: "/sample/valid_ffd",
    says: "Everything behind the answer, for a coach or anyone who wants to check it.",
    options: [
      ["How sure each part is", "The recording, the tracking, the shot, the moments, the measures."],
      ["Every measure", "Its value, its range, where the range comes from, and the frame it was read on."],
      ["Limits and versions", "What isn't claimed, and which build made the result."],
    ],
  },
  {
    id: "print-1", name: "On paper", route: "/report/…/print", href: "/sample/valid_ffd/print",
    says: "The report as a page to print or save as a PDF, readable without colour.",
    options: [
      ["Save as PDF or print", "Uses the phone's own print screen."],
      ["Three moments", "Backlift, foot down and contact, with a ring on the part to fix."],
    ],
  },

  // ---------- Other answers ----------
  {
    id: "sample-ffd_as_bfd", name: "The other defence", route: "/report/…", href: "/sample/ffd_as_bfd",
    says: "Asked as one defence and played as the other: Aline says so and offers that analysis on the same clip.",
    options: [["Check it as the other defence", "Runs the other analysis without filming again."]],
  },
  {
    id: "sample-pull", name: "Another shot", route: "/report/…", href: "/sample/pull",
    says: "A shot Aline doesn't grade yet is named where it can be, and never passed as a defence.",
    options: [["Record again", "Film a defence to get a graded result."]],
  },
  {
    id: "sample-occluded", name: "Can't tell", route: "/report/…", href: "/sample/occluded",
    says: "When the recording doesn't show enough, Aline says so, with each reason and what to change.",
    options: [["The reasons", "For example: the moment of contact was hidden, or two people were in the picture."]],
  },
  {
    id: "sample-photo", name: "A photo", route: "/report/…", href: "/sample/photo",
    says: "A photo is checked as one position: how many checks are right, and what to move.",
    options: [["Send a video", "To check timing and the whole shot."]],
  },
  {
    id: "sample-capture_failed", name: "Couldn't analyse", route: "/report/…", href: "/sample/capture_failed",
    says: "The recording itself failed a check (too short, too dark, the batter too small), with the fix.",
    options: [["Capture checks", "Each check, what it read, and one thing to change."]],
  },

  // ---------- Two angles ----------
  {
    id: "dual-1", name: "Dual-angle capture", route: "/check, Dual-angle capture", href: "/check",
    says: "One ball filmed side-on and from the bowler's end, for the fullest picture.",
    options: [["The steps", "Put one phone at each place, record the same ball, add both clips."]],
  },
  {
    id: "dual-2", name: "Two slots", route: "/check, Dual-angle capture", href: "/check",
    says: "A slot for each angle. Aline checks they show the same ball before putting them together.",
    options: [
      ["Choose", "Add the clip for that position."],
      ["Record here", "Opens the line-up screen for that position."],
      ["Check both videos", "Analyses each, then compares the sound or the movement."],
    ],
  },
  {
    id: "pair-1", name: "Pair two phones", route: "/check/pair", href: "/check/pair",
    says: "Two phones start recording at the same moment. Only signals and results travel, never video.",
    options: [
      ["This phone films", "Side-on, or from the bowler's end."],
      ["Start a pairing", "Shows a six-letter code."],
      ["Join", "The second phone types the code."],
    ],
  },
  {
    id: "pair-2", name: "Paired", route: "/check/pair", href: null,
    says: "Both phones show the same check number, agree on the time, and count down together.",
    options: [
      ["Check number", "The same two digits on both phones, or a stranger joined."],
      ["Start together", "Five seconds to \"Record now\" on both."],
      ["Check each clip", "The second phone sends its result to the first."],
    ],
    captured: "Two browser tabs standing in for two phones.",
  },
  {
    id: "angles", name: "Both angles", route: "/angles", href: null,
    says: "The combined answer when it is the same ball from two places; otherwise two reports and the reason.",
    options: [["Each check", "What each angle was able to measure."]],
    captured: "Shown without a pair on the device: the page says where to open one from.",
  },

  // ---------- Keep improving ----------
  {
    id: "sessions", name: "Sessions", route: "/sessions", href: "/sessions",
    says: "Every shot you checked, kept on this phone.",
    options: [
      ["Front-foot, Back-foot", "Which shot's list."],
      ["Search and filter", "By title, note, tag or result."],
      ["A session", "Opens its report. Add notes and tags; choose it for your baseline."],
    ],
  },
  {
    id: "progress-1", name: "Progress", route: "/progress", href: "/progress",
    says: "How many shots were confirmed, and how each result fell.",
    options: [["Show demo athlete", "A made-up history, to see what yours will look like."]],
  },
  {
    id: "progress-2", name: "Over time", route: "/progress", href: "/progress",
    says: "One chart per measure, against its coaching range and your own baseline.",
    options: [["A point", "The value on that day."]],
  },
  {
    id: "profile-1", name: "Profile", route: "/profile", href: "/profile",
    says: "Your batting side and height. Left-handers are named by their own sides, never mirrored.",
    options: [
      ["Batting hand", "Right- or left-handed."],
      ["Height", "Scales distances when the stumps aren't marked."],
    ],
  },
  {
    id: "profile-2", name: "Level and baseline", route: "/profile", href: "/profile",
    says: "How reports talk to you, optional body measurements, and your personal baseline.",
    options: [
      ["Analysis level", "The same choice as on the capture screen."],
      ["Body measurements", "Optional, kept on the phone, not used in the analysis yet."],
      ["Personal baseline", "Built from six or more of your confirmed defences."],
    ],
  },

  // ---------- Coach ----------
  {
    id: "coach-out", name: "Coach workspace", route: "/coach", href: "/coach",
    says: "Signed out, the page explains the three steps and asks the coach to sign in.",
    options: [["Sign in", "With a link sent by email."]],
  },
  {
    id: "profile-3", name: "Link a coach", route: "/profile", href: "/profile",
    says: "The player signs in, chooses what to share, and enters the coach's invite code.",
    options: [
      ["Consents", "Saving to the account and sharing with a coach are separate switches."],
      ["Under 18", "A parent or guardian must have agreed before a coach can be linked."],
    ],
  },
  {
    id: "coach-1", name: "Review queue", route: "/coach", href: null,
    says: "Players' shared shots: not yet reviewed first, then the least clear recordings.",
    options: [
      ["Everyone, or a squad", "Filters the queue."],
      ["A shot", "Opens it to review."],
    ],
    captured: TEST_ACCOUNT,
  },
  {
    id: "coach-2", name: "The coach's view", route: "/coach", href: null,
    says: "The coach's own view sits beside Aline's result and never changes it.",
    options: [
      ["I agree, I disagree, Not sure", "The coach's view of Aline's result."],
      ["Main thing to work on, notes", "What the player will read."],
      ["Assign", "A drill and a date to check again."],
    ],
    captured: TEST_ACCOUNT,
  },
  {
    id: "coach-3", name: "Squads and history", route: "/coach", href: null,
    says: "Group players, invite new ones, and keep a record of everything done.",
    options: [
      ["Create invite code", "Works once and lasts 14 days."],
      ["History", "Every action, as the player sees it too."],
      ["Export", "Assessments and assignments as a CSV file."],
    ],
    captured: TEST_ACCOUNT,
  },
  {
    id: "feedback", name: "From your coach", route: "/report/…", href: null,
    says: "The player sees the coach's view under Aline's unchanged result, labelled as the coach's.",
    options: [["Mark done", "The only thing a player can change on an assignment."]],
    captured: TEST_ACCOUNT,
  },

  // ---------- References ----------
  {
    id: "library", name: "Reference library", route: "/library", href: "/library",
    says: "What a shot can be compared with, and where each reference comes from.",
    options: [
      ["Yours", "Your usual, once three shots were filmed the same way."],
      ["Made by Aline and from research", "Generated textbook defences, and a research line whose licence isn't confirmed."],
      ["Licensed references", "A coach's model or a player who signed. None yet."],
    ],
  },
  {
    id: "manage", name: "Record a permission", route: "/library/manage", href: null,
    says: "An admin records a player's permission before their reference can appear to anyone.",
    options: [
      ["What, where, until", "Numbers or pictures; in the app or the PDF; an end date or none."],
      ["Signed agreement", "Unsigned, it is shown to no one."],
      ["Withdraw", "Hides the reference for everyone at once."],
    ],
    captured: "Captured with a test admin account; the player's name is made up.",
  },

  // ---------- Your own model ----------
  {
    id: "models", name: "Shot models", route: "/models", href: "/models",
    says: "Your own picture of a correct shot, joint by joint: start one, read one back from text, choose one to be checked against.",
    options: [
      ["New model", "The shot, the batting side, and which angles you will place it from."],
      ["Import from text", "Rebuilds a model from what Export gave."],
      ["Use for my checks", "New reports are set against this model instead of Aline's own ranges."],
    ],
  },
  {
    id: "model-edit", name: "Place the joints", route: "/models/edit", href: null,
    says: "Drag each joint on a 3D mannequin built from them, or on a real batter traced from a clip. Bones keep their length; the orange line stands over the front toe.",
    options: [
      ["Contact, Foot down, Top of the backlift", "The moments a model can hold. Contact is always there."],
      ["Side, Front, 3D", "From the side a joint moves along the pitch and up; from the front, across and up; 3D turns the figure."],
      ["Mannequin, Traced batter", "What the joints sit on: a 3D mannequin built from them, or a real batter's line art."],
      ["Add a bat", "Optional. The bat stays in both hands; drag its toe to set its angle. Checked only on clips where the bat was tracked."],
      ["Undo", "Steps back one move."],
    ],
  },
  {
    id: "model-measures", name: "What the pose measures", route: "/models/edit", href: null,
    says: "Every number a clip will be set against, changing as a joint moves, and each joint's exact place.",
    options: [
      ["Joint", "Choose a joint and type where it is, in centimetres when the height is given."],
      ["Why this is right", "Your own words, saved with the model."],
      ["How close a clip must be", "Tight, Normal or Loose: your setting, not Aline's."],
    ],
  },
  {
    id: "model-text", name: "As text", route: "/models/edit", href: null,
    says: "The whole model as text: every joint at every moment, the lengths and the measures.",
    options: [
      ["Copy, Download", "Take it anywhere; paste it back to rebuild the model."],
      ["Check my shots against this model", "Aline still decides which shot was played."],
    ],
  },
  {
    id: "report-model", name: "Set against your model", route: "/report/…", href: null,
    says: "A confirmed shot is read against your model: how many checks match, and the biggest differences in words.",
    options: [
      ["This shot is checked against", "Your model, or back to Aline's own ranges, for any saved shot."],
      ["Each check against your model", "You, your model, and the reading, moment by moment."],
      ["Not applied", "Another shot, the other batting side or another camera position: the report says which."],
    ],
    captured: "Captured on a saved clip with a model made for the capture.",
  },

  // ---------- Understand and trust ----------
  {
    id: "menu", name: "Menu", route: "every page", href: "/home",
    says: "The bottom bar holds the five places used most; the menu holds the rest.",
    options: [
      ["Home, Sessions, Check, Progress, Profile", "The bottom bar."],
      ["Appearance", "Dark by default; Light for sunshine and print."],
    ],
  },
  {
    id: "guide-1", name: "How it works", route: "/guide", href: "/guide",
    says: "How to film, upload and read a report, with phone settings for slow motion.",
    options: [
      ["Start now", "Opens the capture screen."],
      ["The steps", "Prepare, film, upload, read and train."],
    ],
  },
  {
    id: "science-1", name: "Science", route: "/science", href: "/science",
    says: "How a result is produced, every measure and range, and what is not yet proven.",
    options: [
      ["The decision order", "Recording first, then the shot, then the grade."],
      ["Which measures a recording can give", "By camera position and what was in the picture."],
    ],
  },
  {
    id: "privacy", name: "Privacy", route: "/privacy", href: "/privacy",
    says: "What is kept and where. The video never leaves the phone.",
    options: [["Open data controls", "Export, delete, and every consent."]],
  },
  {
    id: "signin", name: "Sign in", route: "/signin", href: "/signin",
    says: "Only needed to save reports to an account or share with a coach.",
    options: [["Email me a sign-in link", "No password."]],
  },
];

export const FLOWS: Flow[] = [
  {
    id: "first-visit", name: "See what it is", who: "Anyone, before they try it",
    goal: "Knows what Aline does, has seen a real result, and knows what is and isn't proven.",
    steps: ["landing-1", "landing-2", "landing-3", "landing-4", "samples"],
  },
  {
    id: "check", name: "Check a shot", who: "A batter",
    goal: "A result for one shot, from a clip on the phone, with nothing uploaded.",
    steps: ["home", "check-1", "check-2", "check-3", "lineup", "check-film", "report-1"],
    note: "Between the clip and the answer the phone checks the recording, finds the body frame by frame, names the shot, then measures it. If the recording can't be read, it says why.",
  },
  {
    id: "report", name: "Read the report", who: "The batter, a parent, a coach",
    goal: "Knows the one thing to work on, has seen the evidence, and has a drill.",
    steps: ["report-1", "report-evidence", "report-training", "report-comparison", "report-progress", "report-technical", "print-1"],
  },
  {
    id: "answers", name: "When it isn't a graded defence", who: "The batter",
    goal: "An honest answer and what to do next, never a confident wrong one.",
    steps: ["sample-ffd_as_bfd", "sample-pull", "sample-occluded", "sample-photo", "sample-capture_failed"],
  },
  {
    id: "two-angles", name: "Two angles of one ball", who: "A batter with a helper or a second phone",
    goal: "The same ball read from the side and from the bowler's end, put together only when it is the same ball.",
    steps: ["dual-1", "dual-2", "pair-1", "pair-2", "angles"],
    note: "Not yet tried on two real phones over the live connection.",
  },
  {
    id: "improve", name: "Keep improving", who: "The batter",
    goal: "Every shot kept, the change over time visible, and reports worded for them.",
    steps: ["sessions", "progress-1", "progress-2", "profile-1", "profile-2"],
  },
  {
    id: "coach", name: "Work with a coach", who: "A coach and their players",
    goal: "The coach's view and a drill reach the player, and Aline's result is never changed.",
    steps: ["coach-out", "profile-3", "coach-1", "coach-2", "coach-3", "feedback"],
    note: "A coach sees only players who linked them and agreed to share; under 18, only after a parent agreed.",
  },
  {
    id: "references", name: "Compare with a reference", who: "The batter; admins for licences",
    goal: "A fair comparison, with every reference saying where it comes from.",
    steps: ["report-comparison", "library", "manage"],
    note: "No licensed player is in the library yet.",
  },
  {
    id: "own-model", name: "Make your own model", who: "A coach, or a batter with their own picture of the shot",
    goal: "A saved model of a correct shot, as text too, and reports set against it when you choose.",
    steps: ["models", "model-edit", "model-measures", "model-text", "report-model"],
    note: "Aline still decides which shot was played. A model is applied only to a clip confirmed as its shot, for the batting side and camera position it was made for.",
  },
  {
    id: "trust", name: "Understand and trust it", who: "Everyone",
    goal: "Can find how it works, what is proven, and what happens to their data.",
    steps: ["menu", "guide-1", "science-1", "privacy", "signin"],
  },
];

export const screenById = (id: string): Screen | undefined => SCREENS.find((s) => s.id === id);
/** JPEG, so the PDF made from the same pictures stays small (a PDF stores other formats uncompressed). */
export const screenImage = (id: string) => `/design/screens/${id}.jpg`;
/** The document made from this map (scripts/design/pdf.mjs). */
export const DESIGN_PDF = "/design/aline-design.pdf";
/** The size every capture is saved at (a 390 × 844 phone, scaled). */
export const SCREEN_SIZE = { width: 540, height: 1169 } as const;
