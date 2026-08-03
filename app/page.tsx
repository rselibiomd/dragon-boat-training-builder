"use client";

import { useMemo, useState } from "react";

type Focus = "Stability" | "Connection" | "Timing" | "Power" | "Speed";
type LegacyFocus = "Technique" | "Endurance";
type Crew = "Foundational" | "Performance" | "Mixed";
type Emphasis = "Auto" | "Stability" | "Catch" | "Timing" | "Connection" | "Exit & Recovery" | "Starts";

type Drill = {
  name: string;
  set: string;
  objective: string;
  cues: string[];
};

type SessionBlock = {
  id: string;
  name: string;
  detail: string;
  minutes: number;
  icon: string;
  objective: string;
  set: string;
  cues: string[];
};

type SavedPlan = {
  id: string;
  savedAt: string;
  focus: Focus | LegacyFocus;
  duration: number;
  crew: Crew;
  festivalWeeks: number;
  emphasis: Emphasis;
  notes: string;
};

const FOCUSES: Focus[] = ["Stability", "Connection", "Timing", "Power", "Speed"];
const DURATIONS = [60, 75, 90, 120];
const CREWS: Crew[] = ["Foundational", "Performance", "Mixed"];
const WEEKS = [12, 8, 6, 4, 3, 2, 1, 0];
const EMPHASES: Emphasis[] = ["Auto", "Stability", "Connection", "Timing", "Catch", "Exit & Recovery", "Starts"];
const emphasisLabel = (item: Emphasis) => item === "Starts" ? "Starts / Race" : item;

const focusCopy: Record<Focus, { drill: string; main: string; cue: string }> = {
  Stability: {
    drill: "Hull control + posture",
    main: "Stability under movement",
    cue: "Build a stable platform before adding force",
  },
  Connection: {
    drill: "Catch lock + body linkage",
    main: "Connected stroke intervals",
    cue: "Connect the blade, body, and boat before adding pressure",
  },
  Timing: {
    drill: "Crew synchronization",
    main: "Timing under sustained load",
    cue: "Create one entry, one drive, and one exit",
  },
  Power: {
    drill: "Push–pull connection",
    main: "Power intervals",
    cue: "Add pressure only while connection and timing hold",
  },
  Speed: {
    drill: "Rate ladder + fast hands",
    main: "Race-pace repeats",
    cue: "Add rate only when power stays connected",
  },
};

const drillPools: Record<Focus | Exclude<Emphasis, "Auto" | Focus>, Drill[]> = {
  Stability: [
    {
      name: "Tall Paddling for Breathing",
      set: "Crunch into a tight ball and take 5 deep breaths. Sit tall and take 5 deep breaths. Compare the difference, then paddle 2 minutes while maintaining the taller posture.",
      objective: "Show how posture supports breathing, stability, and sustainable movement.",
      cues: ["Sit tall to breathe", "Long spine", "Hinge from the hips"],
    },
    {
      name: "Sectional Paddling",
      set: "Build boat speed and let it run. Paddle by seat pairs or sections: front 4, middle 4, back 6; then front half and back half. Rejoin the whole crew without changing the hull balance.",
      objective: "Develop section awareness while keeping the boat stable as paddlers enter and leave the stroke cycle.",
      cues: ["Watch the front", "Stay in unison", "Keep the hull quiet"],
    },
    {
      name: "Paddling Blind",
      set: "Take 10 strokes to establish boat speed. On the call, paddlers close their eyes and feel the hull and crew rhythm. Begin slower than normal; repeat only as control improves.",
      objective: "Improve balance and boat feel by reducing reliance on visual timing.",
      cues: ["Feel the boat", "Trust the rhythm", "Stay centred"],
    },
    {
      name: "Hang Time — Float It Back",
      set: "Use a 2:1 or 3:1 rhythm: normal drive through the water, then float the paddle back to the front. Compare 20 rushed recoveries with 20 strokes that allow the boat to glide.",
      objective: "Create stability and glide by removing unnecessary movement during recovery.",
      cues: ["Let it run", "Feel the glide", "Quiet recovery"],
    },
  ],
  Connection: [
    {
      name: "Push and Pull",
      set: "Start with the blade fully buried at the front. Pull through with best technique. At the exit, keep the blade in the water and move it back to the front. Repeat slowly, then transfer the same loaded feeling into normal strokes.",
      objective: "Help paddlers feel continuous blade load and recognize when pressure slips.",
      cues: ["Feel the water", "Do not lose the load", "Blade buried before pressure"],
    },
    {
      name: "Frankenstein",
      set: "Paddle without bending the elbows. Move the paddle only through core rotation and the cycling of the legs and hips. Use short rounds, then return to normal paddling without losing the body-driven movement.",
      objective: "Remove arm pulling so paddlers connect the paddle to rotation, legs, and hips.",
      cues: ["No arms — rotate", "Show your back", "Legs and hips move the boat"],
    },
    {
      name: "Upside Down Paddle",
      set: "Turn paddles upside down and move through the stroke slowly. Search for resistance instead of pushing through. Turn paddles back and reproduce the same heavy-water feeling with a fully buried blade.",
      objective: "Heighten awareness of heavy water, blade loading, and pressure transfer.",
      cues: ["Find heavy water", "Load before drive", "Do not slip"],
    },
    {
      name: "Use Your Body",
      set: "Take 10 strokes hands only; 10 hands and arms; 10 adding shoulders; 10 adding core rotation; 10 adding hip rotation; and 10 adding heel pressure and hip cycling. Briefly explain each layer.",
      objective: "Build the stroke progressively so paddlers feel whole-body connection rather than arm effort.",
      cues: ["Build the body", "Legs and hips", "Drive the boat"],
    },
  ],
  Timing: [
    {
      name: "7-Up",
      set: "The whole boat takes 1 stroke, resets at the front, and lets the boat glide. Then take 2 continuous strokes and reset. Build through 3, 4, 5, 6, and 7 strokes.",
      objective: "Rebuild whole-boat synchronization while preserving the set-up and glide between repetitions.",
      cues: ["Together first", "Match the front", "Reset together"],
    },
    {
      name: "Part Paddling",
      set: "Build boat speed and let it run. Two paddlers at a time take 10 strokes with their seat partner, moving from seat 1 through seat 10 and back. Repeat with groups of 4, halves, or odds and evens.",
      objective: "Make section timing visible and teach paddlers to match the boat before adding effort.",
      cues: ["See the boat", "Stay together", "Match the front"],
    },
    {
      name: "Pause Strokes",
      set: "Hold paddles just above the water. On command, take 1 stroke and reset to the starting position. Repeat, then build to 2, 3, and up to 10 continuous strokes. Rest shoulders between sets.",
      objective: "Develop patience at the front and a shared start to every stroke sequence.",
      cues: ["Hold the front", "Reset together", "Bury first"],
    },
    {
      name: "Stroke Rate",
      set: "Paddle slowly for 10 strokes. On the call “3-2-1-Up,” increase rate together for 10 strokes. Return to the slower rhythm and repeat several times without losing length.",
      objective: "Teach the crew to change rate as one unit instead of accelerating individually.",
      cues: ["Rate up together", "Keep the length", "One rhythm"],
    },
  ],
  Power: [
    {
      name: "Use Your Body",
      set: "Take 10 strokes hands only; 10 hands and arms; 10 adding shoulders; 10 adding core rotation; 10 adding hip rotation; and 10 adding heel pressure and hip cycling. Explain the change in force between layers.",
      objective: "Show how progressively adding the body increases force without simply pulling harder with the arms.",
      cues: ["Build the body", "Legs and hips", "Drive the boat"],
    },
    {
      name: "Legs Cycling",
      set: "Try paddle-side foot forward, non-paddle-side foot forward, both legs behind, then both legs forward. Paddle briefly in each position and ask how the force transfer changes. Finish in the strongest stable position.",
      objective: "Help paddlers feel how leg position and hip cycling contribute to force production.",
      cues: ["Push the floor", "Stable seat", "Legs connect to the blade"],
    },
    {
      name: "Push and Pull",
      set: "Start with the blade fully buried at the front. Pull through with best technique. Keep the blade in the water at the exit and move it back to the front. Repeat, then apply the same load to 10 strong normal strokes.",
      objective: "Develop force against loaded water while preventing blade slip.",
      cues: ["Feel the water", "Do not lose the load", "Heavy before hard"],
    },
    {
      name: "Upside Down Paddle",
      set: "Turn paddles upside down and move through the stroke. Find resistance instead of rushing through it. Turn paddles back and take 20 strokes with full blades and the same heavy-water feeling.",
      objective: "Reinforce that effective power begins with connection to heavy water.",
      cues: ["Find heavy water", "Bury first", "Body drives the boat"],
    },
  ],
  Speed: [
    {
      name: "Stroke Rate",
      set: "Paddle slowly for 10 strokes. On “3-2-1-Up,” increase rate together for 10 strokes. Repeat, adding rate only while the crew preserves length, blade depth, and timing.",
      objective: "Increase stroke rate as one crew without shortening or rushing the front end.",
      cues: ["Rate up together", "Quick air, patient catch", "Keep the length"],
    },
    {
      name: "Hang Time — Float It Back",
      set: "Use a 2:1 rhythm between the drive and recovery. Feel the boat glide, then gradually reduce the air time while preserving the same clean run and relaxed recovery.",
      objective: "Teach paddlers to gain rate through efficient recovery rather than rushing the water phase.",
      cues: ["Let it run", "Rate comes from the air", "Do not rush the catch"],
    },
    {
      name: "Your Paddle Talks to You",
      set: "Paddle at a controlled rate and listen for splash at entry and exit. Increase the rate in short steps, stopping whenever the sound becomes noisy. Reset and repeat cleanly.",
      objective: "Use sound as immediate feedback for catch and exit quality as speed rises.",
      cues: ["Quiet is clean", "Bury first", "Out at the hip"],
    },
    {
      name: "Middle Acceleration",
      set: "Take 4–15 fast, powerful strokes at one-half to three-quarter length. Adjust the number to the crew’s strength and timing. Recover fully and repeat only when the boat is settled.",
      objective: "Develop fast acceleration without trading away blade load or crew synchronization.",
      cues: ["Fast but powerful", "Full blade", "Move together"],
    },
  ],
  Catch: [
    {
      name: "Catch and Pull",
      set: "Set up at the front. Catch and count one out loud before sitting up and pulling. Perform stopped or very slowly, then remove the count while keeping the same sequence.",
      objective: "Separate blade entry from pressure to correct splashing and early pulling.",
      cues: ["Bury first", "Catch, then go", "Quiet entry"],
    },
    {
      name: "Find Your Entry Point",
      set: "Place the blade fully buried at the exit and move it through the water toward the catch. Mark the natural reach point on the gunnel. Use that point as the target during normal air recovery.",
      objective: "Find an effective entry point without collapsing or overreaching.",
      cues: ["Drop to full blade", "Find your point", "Length without collapse"],
    },
    {
      name: "¼, ½, ¾, Whole Paddle",
      set: "Paddle first with only the blade corner in the water, then one-half, three-quarters, and finally the whole blade. Hold each depth long enough to clearly feel the difference.",
      objective: "Build awareness of blade depth and show why full burial is required for effective pressure.",
      cues: ["Full blade equals full power", "Bury first", "Quiet entry"],
    },
    {
      name: "Pause Strokes",
      set: "Hold paddles just above the water. Take 1 stroke on command and reset. Build gradually to 10 continuous strokes, preserving the same set position and simultaneous catch.",
      objective: "Develop front-end patience, preparation, and a synchronized entry.",
      cues: ["Hold the front", "Reset together", "Catch together"],
    },
  ],
  "Exit & Recovery": [
    {
      name: "Catch and Pull — Exit Correction",
      set: "Paddle with a consistent downward press through the drive. At the exit, lift the chest as the blade presses down and out. Transfer the clean exit into 20 normal strokes.",
      objective: "Correct shovelling and a negative blade angle at the exit.",
      cues: ["Press down and out", "Chest up", "Out at the hip"],
    },
    {
      name: "Hang Time — Float It Back",
      set: "Use a 2:1 or 3:1 rhythm: normal water phase, then float the paddle to the front. Compare rushed recovery with deliberate glide and keep the cleaner boat run.",
      objective: "Remove recovery rush and allow the boat to glide before the next catch.",
      cues: ["Let it run", "Feel the glide", "Hands travel quietly"],
    },
    {
      name: "Your Paddle Talks to You",
      set: "Listen to the sound of each entry and exit. Paddle at a steady rate and reduce splash at both ends of the stroke before adding speed.",
      objective: "Use sound to identify a clean exit and efficient blade path.",
      cues: ["Quiet is clean", "Out at the hip", "Relax forward"],
    },
    {
      name: "Do Not Spill the Champagne",
      set: "Imagine holding a fine glass in the bottom hand. Move through the stroke while keeping the bottom hand and arm parallel to the water. Repeat in short controlled sets.",
      objective: "Correct the bottom-arm path and maintain extension through exit and recovery.",
      cues: ["Do not spill", "Bottom arm level", "Smooth path"],
    },
  ],
  Starts: [
    {
      name: "Starts — First Strokes",
      set: "Take 3–5 slow, fully buried strokes from a dead stop at one-half to three-quarter length. Lean forward and slightly outside; the first movement is down into the water.",
      objective: "Move the boat cleanly from a dead stop before acceleration begins.",
      cues: ["First motion down", "Full blade", "Load together"],
    },
    {
      name: "Middle Acceleration",
      set: "Take 4–15 fast, powerful strokes at one-half to three-quarter length. Choose the count based on crew strength and timing, then recover fully before repeating.",
      objective: "Accelerate the hull after the first strokes without losing connection.",
      cues: ["Fast but powerful", "Full blade", "Accelerate together"],
    },
    {
      name: "Transition",
      set: "Once top speed is reached, shift into the full race stroke over 3–5 strokes rather than changing in one stroke. Repeat the transition separately before joining the full sequence.",
      objective: "Move smoothly from acceleration to race rhythm without disrupting timing.",
      cues: ["Build into race stroke", "Change together", "Keep the load"],
    },
  ],
};

function mainSet(focus: Focus, minutes: number, crew: Crew, festivalWeeks: number) {
  const pressure = crew === "Foundational" ? "RPE 5–6" : crew === "Mixed" ? "RPE 6–7" : "RPE 7";
  const specificity = festivalWeeks <= 1 ? "Keep the repetitions short and exact; stop before quality fades." : festivalWeeks <= 3 ? "Use the crew's intended race rhythm, but this is not a race simulation." : "Keep the rate controlled and build capacity around the selected quality.";
  if (focus === "Stability") {
    return `Repeat through the block: 6 minutes at RPE 4–5 with 90 seconds easy. Use 2 minutes each for posture, controlled reach, and a quiet hull. If balance breaks, take 10 easy strokes and rebuild it. ${specificity}`;
  }
  if (focus === "Connection") {
    return `Repeat through the block: 6 minutes at ${pressure} with 90 seconds easy. Every 2 minutes, use 10 strokes to confirm blade lock, body connection, and pressure transfer before returning to continuous paddling. ${specificity}`;
  }
  if (focus === "Timing") {
    return `Repeat through the block: 6 minutes at ${pressure} with 90 seconds easy. Hold a controlled rate and progress from matching the catch, to matching pressure, to matching the exit and recovery. ${specificity}`;
  }
  if (focus === "Power") {
    return `Repeat through the block: 45 seconds heavy pressure at 70–75% race rate, 75 seconds easy, then 10 connected power strokes. Take a full 2-minute reset after every five repetitions. ${specificity}`;
  }
  return `Two sets of 6 × 20 seconds at target rate with 40 seconds easy. Take 3 minutes between sets, then use remaining time for 60-second pace pieces with full technical resets. ${specificity}`;
}

function resolveDrills(focus: Focus, emphasis: Emphasis, variation: number, count: number) {
  const poolKey = emphasis === "Auto" ? focus : emphasis;
  const options = drillPools[poolKey];
  return Array.from({ length: Math.min(count, options.length) }, (_, index) => options[(variation + index) % options.length]);
}

function normalizeFocus(focus: Focus | LegacyFocus): Focus {
  if (focus === "Technique") return "Connection";
  if (focus === "Endurance") return "Timing";
  return focus;
}

function buildSession(
  focus: Focus,
  duration: number,
  crew: Crew,
  festivalWeeks: number,
  emphasis: Emphasis,
  variation: number,
): SessionBlock[] {
  const warmUp = duration <= 60 ? 9 : duration <= 90 ? 12 : 15;
  const drillCount = duration <= 60 ? 2 : 3;
  const drillMinutes = duration <= 60 ? 14 : duration <= 75 ? 18 : duration <= 90 ? 21 : 27;
  const cooldown = duration <= 60 ? 6 : duration <= 90 ? 8 : 10;
  const raceNeeded = emphasis === "Starts";
  const race = raceNeeded ? (duration <= 60 ? 8 : duration <= 90 ? 12 : 16) : 0;
  const mainMinutes = duration - warmUp - drillMinutes - cooldown - race;
  const drills = resolveDrills(focus, emphasis, variation, drillCount);
  const baseDrillMinutes = Math.floor(drillMinutes / drills.length);
  const extraDrillMinutes = drillMinutes % drills.length;
  const easy = Math.max(3, Math.round(warmUp * 0.35));
  const activation = 2;
  const boatFeel = warmUp - easy - activation;
  const crewPrefix = crew === "Foundational" ? "Controlled" : crew === "Mixed" ? "Progressive" : "Performance";

  const blocks: SessionBlock[] = [
    {
      id: "warmup",
      name: "Warm-up",
      detail: "Activation + boat feel",
      minutes: warmUp,
      icon: "↗",
      objective: "Raise body temperature, settle the hull, and establish one relaxed crew rhythm.",
      set: `${activation} min mobility and posture reset; ${easy} min easy continuous paddle; ${boatFeel} min alternating 10 build strokes with 20 easy strokes.`,
      cues: ["Tall posture", "Loose hands", "Boat moves before rate rises"],
    },
  ];

  drills.forEach((drill, index) => {
    blocks.push({
      id: `drill-${index + 1}`,
      name: `Drill ${index + 1}`,
      detail: drill.name,
      minutes: baseDrillMinutes + (index < extraDrillMinutes ? 1 : 0),
      icon: "◒",
      objective: drill.objective,
      set: drill.set,
      cues: drill.cues,
    });
  });

  blocks.push({
      id: "main",
      name: "Main set",
      detail: `${crewPrefix} ${focusCopy[focus].main.toLowerCase()}`,
      minutes: mainMinutes,
      icon: "⌁",
      objective: focus === "Stability" ? "Maintain balance and posture while the boat is moving." : focus === "Connection" ? "Transfer pressure cleanly from the paddler through the planted blade into the boat." : focus === "Timing" ? "Hold one crew rhythm as effort and duration increase." : focus === "Power" ? "Increase force per stroke while protecting connection and crew timing." : "Reach race rate without trading away connection, timing, or clean exits.",
      set: mainSet(focus, mainMinutes, crew, festivalWeeks),
      cues: [focusCopy[focus].cue, crew === "Foundational" ? "Quality decides the intensity" : "Reset immediately when timing slips", "One boat, one surge"],
    });

  if (raceNeeded) {
    blocks.push({
      id: "race",
      name: "Race execution",
      detail: festivalWeeks === 0 ? "Start sequence + full race plan" : "Start sequence + controlled execution",
      minutes: race,
      icon: "⚑",
      objective: "Rehearse the calls and transitions the crew must execute automatically on race day.",
      set: duration >= 90 ? "Join the three start phases into 3 complete starts using 5–5–5–10–3. If festival week is selected, finish with up to 2 × 200 m controlled race executions with full recovery; otherwise stop after the start work." : "Join the three start phases into 3 complete starts using 5–5–5–10–3. Add one 200 m execution only if the crew needs it and technique remains clean.",
      cues: ["First five: place and load", "Transition together", "Finish with length before rate"],
    });
  }

  blocks.push({
    id: "cooldown",
    name: "Cool-down",
    detail: "Easy paddle + mobility",
    minutes: cooldown,
    icon: "⌄",
    objective: "Lower effort gradually and leave the crew with the session's best technical feeling.",
    set: `${Math.max(4, cooldown - 2)} min easy continuous paddle, then 2 min shoulder, hip, and thoracic mobility at the dock.`,
    cues: ["Long and quiet", "Breathe down", "Name one cue to carry forward"],
  });

  return blocks;
}

function PaddleMark() {
  return <span className="paddle-mark" aria-hidden="true"><span /></span>;
}

export default function Home() {
  const [focus, setFocus] = useState<Focus>("Stability");
  const [duration, setDuration] = useState(90);
  const [crew, setCrew] = useState<Crew>("Performance");
  const [festivalWeeks, setFestivalWeeks] = useState(3);
  const [emphasis, setEmphasis] = useState<Emphasis>("Auto");
  const [variation, setVariation] = useState(0);
  const [notes, setNotes] = useState("");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const session = useMemo(
    () => buildSession(focus, duration, crew, festivalWeeks, emphasis, variation),
    [focus, duration, crew, festivalWeeks, emphasis, variation],
  );
  const total = session.reduce((sum, block) => sum + block.minutes, 0);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function generateSession() {
    setVariation((value) => value + 1);
    window.setTimeout(() => document.getElementById("full-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function openLibrary() {
    const saved = JSON.parse(window.localStorage.getItem("dragonboat-plans") ?? "[]") as SavedPlan[];
    setSavedPlans(saved);
    setLibraryOpen(true);
  }

  function savePlan() {
    const saved = JSON.parse(window.localStorage.getItem("dragonboat-plans") ?? "[]") as SavedPlan[];
    const plan: SavedPlan = {
      id: String(Date.now()),
      savedAt: new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }),
      focus,
      duration,
      crew,
      festivalWeeks,
      emphasis,
      notes,
    };
    const next = [plan, ...saved].slice(0, 12);
    window.localStorage.setItem("dragonboat-plans", JSON.stringify(next));
    setSavedPlans(next);
    showNotice("Practice saved on this device");
  }

  function loadPlan(plan: SavedPlan) {
    setFocus(normalizeFocus(plan.focus));
    setDuration(plan.duration);
    setCrew(plan.crew);
    setFestivalWeeks(plan.festivalWeeks);
    setEmphasis(plan.emphasis);
    setNotes(plan.notes);
    setVariation(0);
    setLibraryOpen(false);
    showNotice("Saved practice loaded");
  }

  async function copyPlan() {
    const text = [
      `${focus.toUpperCase()} PRACTICE — ${duration} MIN — ${crew.toUpperCase()} CREW`,
      `Festival: ${festivalWeeks === 0 ? "race day" : `${festivalWeeks} weeks away`} | Emphasis: ${emphasisLabel(emphasis)}`,
      "",
      ...session.flatMap((block, index) => [
        `${index + 1}. ${block.name.toUpperCase()} — ${block.minutes} min`,
        block.objective,
        `Set: ${block.set}`,
        `Cues: ${block.cues.join(" • ")}`,
        "",
      ]),
      notes ? `Coach notes: ${notes}` : "",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    showNotice("Practice copied");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#builder" aria-label="Dragon Boat Training Builder home">
          <span className="brand-logo-frame">
            <img
              className="brand-logo"
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/kdbc-logo.jpeg`}
              alt="Kingston Dragon Boat Club"
            />
          </span>
          <span className="brand-title">Training Builder</span>
        </a>
        <button className="saved-button" onClick={openLibrary} type="button" aria-label="Open saved practices">
          <span aria-hidden="true">▱</span> Saved practices
        </button>
        <div className="coach-avatar" title="Coach Nico" aria-label="Coach Nico">NS</div>
      </header>

      <section className="builder-grid" id="builder">
        <div className="builder-panel">
          <div className="intro">
            <p className="eyebrow">Practice design console</p>
            <h1>Build today&apos;s practice</h1>
            <p>Set the context. Get a coherent session built for your crew in seconds.</p>
          </div>

          <div className="quick-controls">
            <label className="control-card">
              <span className="control-heading"><b>Session focus</b><i aria-hidden="true">◎</i></span>
              <span className="select-wrap"><PaddleMark />
                <select aria-label="Session focus" value={focus} onChange={(event) => setFocus(event.target.value as Focus)}>
                  {FOCUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </span>
            </label>
            <label className="control-card">
              <span className="control-heading"><b>Duration</b><i aria-hidden="true">◷</i></span>
              <span className="select-wrap plain">
                <select aria-label="Duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  {DURATIONS.map((item) => <option key={item} value={item}>{item} min</option>)}
                </select>
              </span>
            </label>
            <label className="control-card">
              <span className="control-heading"><b>Crew</b><i aria-hidden="true">♙</i></span>
              <span className="select-wrap plain">
                <select aria-label="Crew" value={crew} onChange={(event) => setCrew(event.target.value as Crew)}>
                  {CREWS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </span>
            </label>
          </div>

          <div className="festival-card">
            <div className="section-heading">
              <div><h2>Festival proximity</h2><strong>{festivalWeeks === 0 ? "Race day" : `${festivalWeeks} week${festivalWeeks === 1 ? "" : "s"}`}</strong></div>
              <span aria-hidden="true">▦</span>
            </div>
            <input aria-label="Weeks until festival" max={WEEKS.length - 1} min="0" onChange={(event) => setFestivalWeeks(WEEKS[Number(event.target.value)])} type="range" value={WEEKS.indexOf(festivalWeeks)} />
            <div className="range-labels" aria-hidden="true">
              {WEEKS.map((week) => <span className={festivalWeeks === week ? "selected" : ""} key={week}>{week === 0 ? "Race day" : `${week}w`}</span>)}
            </div>
          </div>

          <aside className="festival-note festival-note-wide">
            <span className="note-icon" aria-hidden="true">▦</span>
            <div>
              <h3>{festivalWeeks === 0 ? "Race-day window" : festivalWeeks <= 3 ? `Festival in ${festivalWeeks} week${festivalWeeks === 1 ? "" : "s"}` : "Development window"}</h3>
              <p>{festivalWeeks <= 3 ? `Keep the ${focus.toLowerCase()} work specific and exact. Race execution is added only when “Starts / Race” is selected below.` : `Build ${focus.toLowerCase()} quality and capacity. Race execution stays out unless you deliberately select it.`}</p>
            </div>
          </aside>

          <div className="coach-rule"><span>Coach&apos;s rule</span><p>{focusCopy[focus].cue}.</p></div>
          <button className="build-button" onClick={generateSession} type="button"><PaddleMark />Build complete practice</button>
        </div>

        <aside className="summary-card" aria-live="polite">
          <div className="summary-header">
            <div><p className="eyebrow">Live plan</p><h2>Session summary</h2><p>{duration} min <span>•</span> {crew} crew</p></div>
            <span className="quality-badge">Balanced</span>
          </div>
          <ol className="session-timeline">
            {session.map((block, index) => (
              <li key={block.id}><span className="step-number">{index + 1}</span><span className="block-icon" aria-hidden="true">{block.icon}</span><span className="block-copy"><strong>{block.name}</strong><small>{block.detail}</small></span><b>{block.minutes} min</b></li>
            ))}
          </ol>
          <div className="total-row"><span aria-hidden="true">◷</span><strong>Total</strong><b>{total} min</b></div>
        </aside>
      </section>

      <section className="full-plan" id="full-plan">
        <div className="plan-heading">
          <div><p className="eyebrow">Ready to coach</p><h2>Your complete practice</h2><p>Each practice uses two or three drills from the KDBC cue-card system, followed by one focused main set.</p></div>
          <div className="plan-actions">
            <button onClick={savePlan} type="button">♡ Save</button>
            <button onClick={copyPlan} type="button">▣ Copy</button>
            <button onClick={() => window.print()} type="button">▤ Print</button>
          </div>
        </div>

        <div className="emphasis-panel">
          <div><strong>Technical emphasis</strong><span>Optional. “Auto” chooses drills for the session focus. Select “Starts / Race” only when you want race work.</span></div>
          <div className="chip-row" role="group" aria-label="Technical emphasis">
            {EMPHASES.map((item) => <button className={emphasis === item ? "active" : ""} key={item} onClick={() => setEmphasis(item)} type="button">{emphasisLabel(item)}</button>)}
          </div>
        </div>

        <div className="plan-layout">
          <div className="detailed-blocks">
            {session.map((block, index) => (
              <article className="detail-card" key={`${block.id}-${block.detail}`}>
                <div className="detail-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="detail-content">
                  <div className="detail-title"><div><span>{block.minutes} minutes</span><h3>{block.name}</h3><p>{block.detail}</p></div>{block.id.startsWith("drill-") && <button onClick={() => setVariation((value) => value + 1)} type="button">↻ New drill mix</button>}</div>
                  <div className="detail-grid">
                    <div><h4>Purpose</h4><p>{block.objective}</p></div>
                    <div><h4>Set</h4><p>{block.set}</p></div>
                  </div>
                  <div className="cue-list"><strong>Coach cues</strong>{block.cues.map((cue) => <span key={cue}>{cue}</span>)}</div>
                </div>
              </article>
            ))}
          </div>

          <aside className="coach-notes">
            <div className="notes-card">
              <p className="eyebrow">On-water notes</p>
              <h3>Coach&apos;s reminders</h3>
              <textarea aria-label="Coach notes" onChange={(event) => setNotes(event.target.value)} placeholder="Crew attendance, seat changes, conditions, corrections to revisit…" value={notes} />
              <small>Notes are included when you copy, print, or save the practice.</small>
            </div>
            <div className="logic-card">
              <span>Session logic</span>
              <p>The drills teach or reset the selected quality. The main set then asks the crew to sustain that same quality under an appropriate load.</p>
            </div>
          </aside>
        </div>
      </section>

      {libraryOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setLibraryOpen(false)}>
          <aside className="library-drawer" aria-label="Saved practices" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><div><p className="eyebrow">This device</p><h2>Saved practices</h2></div><button aria-label="Close saved practices" onClick={() => setLibraryOpen(false)} type="button">×</button></div>
            {savedPlans.length === 0 ? <div className="empty-state"><span>▱</span><h3>No saved practices yet</h3><p>Save a session and it will appear here for quick reuse.</p></div> : (
              <div className="saved-list">{savedPlans.map((plan) => <button key={plan.id} onClick={() => loadPlan(plan)} type="button"><span><strong>{normalizeFocus(plan.focus)} · {plan.duration} min</strong><small>{plan.crew} crew · {plan.savedAt}</small></span><b>Load →</b></button>)}</div>
            )}
          </aside>
        </div>
      )}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}
