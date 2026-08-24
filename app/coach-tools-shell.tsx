"use client";

import { useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STROKE_REVIEW_PATH = "/dragonboat-stroke-coach/";

function clickModule(label: "Training Builder" | "Boat Planner") {
  const attempt = () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".module-nav button")]
      .find((item) => item.textContent?.trim() === label);
    if (button) {
      button.click();
      return true;
    }
    return false;
  };

  if (attempt()) return;
  window.setTimeout(attempt, 120);
  window.setTimeout(attempt, 450);
}

export default function CoachToolsShell() {
  const [open, setOpen] = useState(true);
  const [strokeOpen, setStrokeOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState("");
  const [standalone, setStandalone] = useState(false);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const strokeReviewUrl = useMemo(() => {
    if (typeof window === "undefined") return STROKE_REVIEW_PATH;
    return `${window.location.origin}${STROKE_REVIEW_PATH}`;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingReview = params.get("from") === "stroke-review" || params.has("strokeReview");
    const requestedTool = params.get("tool");

    if (incomingReview || requestedTool === "training") {
      setOpen(false);
      clickModule("Training Builder");
    } else if (requestedTool === "boats") {
      setOpen(false);
      clickModule("Boat Planner");
    } else if (requestedTool === "stroke") {
      setOpen(false);
      setStrokeOpen(true);
    }

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", installHandler);

    const brandHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".brand-button")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setStrokeOpen(false);
      setOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    document.addEventListener("click", brandHandler, true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", installHandler);
      document.removeEventListener("click", brandHandler, true);
    };
  }, [basePath]);

  const openTool = (tool: "training" | "boats" | "stroke") => {
    setOpen(false);
    if (tool === "stroke") {
      setStrokeOpen(true);
      return;
    }
    setStrokeOpen(false);
    clickModule(tool === "training" ? "Training Builder" : "Boat Planner");
  };

  const openHome = () => {
    setStrokeOpen(false);
    setOpen(true);
  };

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallMessage("KDBC Coach Tools is being installed.");
        setInstallPrompt(null);
      }
      return;
    }

    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isiOS) {
      setInstallMessage("On iPhone or iPad: open this page in Safari, tap Share, then choose Add to Home Screen.");
    } else {
      setInstallMessage("In Chrome, use the Install icon in the address bar or open the browser menu and choose Install KDBC Coach Tools.");
    }
  };

  return (
    <>
      <div className={`coach-tools-home ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="coach-tools-home-inner">
          <header className="coach-tools-home-header">
            <div className="coach-tools-brand">
              <img src={`${basePath}/kdbc-logo.jpeg`} alt="Kingston Dragon Boat Club" />
              <div>
                <p>KINGSTON DRAGON BOAT CLUB</p>
                <h1>KDBC Coach Tools</h1>
                <span>Review technique, build the practice, and organize the boat from one coaching workspace.</span>
              </div>
            </div>
            {!standalone && (
              <button className="coach-tools-install" type="button" onClick={installApp}>
                Install app
              </button>
            )}
          </header>

          <main className="coach-tools-launch-grid">
            <button className="coach-tool-card stroke" type="button" onClick={() => openTool("stroke")}>
              <span className="coach-tool-index">01</span>
              <div className="coach-tool-icon" aria-hidden="true">◫</div>
              <div>
                <p>TECHNIQUE</p>
                <h2>Stroke Review</h2>
                <span>Review paddler video, mark stroke phases, build feedback, export phase images, and send technical priorities into practice planning.</span>
              </div>
              <strong>Open Stroke Review →</strong>
            </button>

            <button className="coach-tool-card training" type="button" onClick={() => openTool("training")}>
              <span className="coach-tool-index">02</span>
              <div className="coach-tool-icon" aria-hidden="true">≋</div>
              <div>
                <p>PRACTICE</p>
                <h2>Training Builder</h2>
                <span>Build a complete session around stability, technique, endurance, power, speed, festival timing, and observed crew needs.</span>
              </div>
              <strong>Build a Practice →</strong>
            </button>

            <button className="coach-tool-card boat" type="button" onClick={() => openTool("boats")}>
              <span className="coach-tool-index">03</span>
              <div className="coach-tool-icon" aria-hidden="true">⌁</div>
              <div>
                <p>CREW</p>
                <h2>Boat Planner</h2>
                <span>Build and save a clear race or practice lineup with seat assignments, sides, spares, and printable crew views.</span>
              </div>
              <strong>Plan the Boat →</strong>
            </button>
          </main>

          <section className="coach-tools-flow" aria-label="KDBC coaching workflow">
            <span>COACHING FLOW</span>
            <div><b>Review</b><i>→</i><b>Prioritize</b><i>→</i><b>Train</b><i>→</i><b>Organize</b></div>
            <p>Fix the biggest limiter first. Build stability and technique before endurance, power, and speed. Timing stays a quality standard throughout.</p>
          </section>

          {installMessage && <p className="coach-tools-install-message">{installMessage}</p>}
          <footer className="coach-tools-home-footer">Device-first coaching tools · KDBC 2026</footer>
        </div>
      </div>

      {strokeOpen && (
        <div className="coach-tools-stroke-workspace">
          <header>
            <button type="button" onClick={openHome}>← Coach Tools</button>
            <strong>Stroke Review</strong>
            <a href={strokeReviewUrl} target="_blank" rel="noreferrer">Open separately</a>
          </header>
          <iframe
            src={strokeReviewUrl}
            title="KDBC Dragonboat Stroke Review"
            allow="fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {!open && !strokeOpen && (
        <button className="coach-tools-home-return" type="button" onClick={openHome} aria-label="Open KDBC Coach Tools home">
          Coach Tools
        </button>
      )}
    </>
  );
}
