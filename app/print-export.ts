import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export type PrintExportFormat = "pdf" | "png";
export type PrintOrientation = "portrait" | "landscape";

type ExportPrintPagesOptions = {
  filename: string;
  format: PrintExportFormat;
  orientation: PrintOrientation;
  pageSelector: string;
};

const PAGE = {
  portrait: { width: 8.5, height: 11, marginTop: 0.38, marginRight: 0.42, marginBottom: 0.34, marginLeft: 0.42 },
  landscape: { width: 11, height: 8.5, marginTop: 0.3, marginRight: 0.34, marginBottom: 0.26, marginLeft: 0.34 },
} as const;

function cleanFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "kdbc-export";
}

function exportStyles() {
  const rules: string[] = [];
  [...document.styleSheets].forEach((sheet) => {
    try {
      [...sheet.cssRules].forEach((rule) => {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const mediaRule = rule as CSSMediaRule;
          if (mediaRule.conditionText.toLowerCase().includes("print")) {
            [...mediaRule.cssRules].forEach((nestedRule) => rules.push(nestedRule.cssText));
          }
          return;
        }
        rules.push(rule.cssText);
      });
    } catch {
      // Ignore browser or extension stylesheets that are not readable from this origin.
    }
  });
  return rules.join("\n");
}

async function nextPaint() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

async function findPages(selector: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pages = [...document.querySelectorAll<HTMLElement>(selector)];
    if (pages.length) return pages;
    await nextPaint();
  }
  throw new Error("The printable pages were not ready.");
}

async function waitForImages(root: ParentNode) {
  await Promise.all([...root.querySelectorAll("img")].map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
}

async function renderPage(page: HTMLElement, orientation: PrintOrientation) {
  const size = PAGE[orientation];
  const contentWidth = size.width - size.marginLeft - size.marginRight;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    border: "0",
    height: "1px",
    left: "-200vw",
    opacity: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    width: `${contentWidth}in`,
  });
  document.body.appendChild(frame);

  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("The export workspace could not be created.");
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><style>
      html, body { background: #fff !important; color: #102437; font-family: Arial, Helvetica, sans-serif; margin: 0 !important; padding: 0 !important; }
      *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      ${exportStyles()}
      .export-document-page {
        break-after: auto !important;
        display: block !important;
        margin: 0 !important;
        overflow: visible !important;
        padding-bottom: 0.08in !important;
        page-break-after: auto !important;
        width: ${contentWidth}in !important;
      }
    </style></head><body></body></html>`);
    frameDocument.close();

    const clone = page.cloneNode(true) as HTMLElement;
    clone.classList.add("export-document-page");
    const sourceImages = [...page.querySelectorAll("img")];
    [...clone.querySelectorAll("img")].forEach((image, index) => {
      image.src = sourceImages[index]?.currentSrc || sourceImages[index]?.src || image.src;
    });
    const printDocument = page.closest<HTMLElement>(".print-document");
    const wrapper = frameDocument.createElement("section");
    wrapper.className = printDocument?.className ?? "print-document";
    wrapper.style.display = "block";
    wrapper.appendChild(clone);
    frameDocument.body.appendChild(wrapper);
    await frameDocument.fonts?.ready;
    await waitForImages(clone);
    await new Promise<void>((resolve) => frame.contentWindow?.requestAnimationFrame(() => frame.contentWindow?.requestAnimationFrame(() => resolve())) ?? resolve());

    return await html2canvas(clone, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
      windowHeight: Math.max(clone.scrollHeight, clone.offsetHeight),
      windowWidth: Math.max(clone.scrollWidth, clone.offsetWidth),
    });
  } finally {
    frame.remove();
  }
}

function placeOnLetterPage(content: HTMLCanvasElement, orientation: PrintOrientation) {
  const size = PAGE[orientation];
  const pixelsPerInch = 192;
  const page = document.createElement("canvas");
  page.width = Math.round(size.width * pixelsPerInch);
  page.height = Math.round(size.height * pixelsPerInch);
  const context = page.getContext("2d");
  if (!context) throw new Error("The export image could not be created.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, page.width, page.height);

  const availableWidth = (size.width - size.marginLeft - size.marginRight) * pixelsPerInch;
  const availableHeight = (size.height - size.marginTop - size.marginBottom) * pixelsPerInch;
  const scale = Math.min(availableWidth / content.width, availableHeight / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  const x = size.marginLeft * pixelsPerInch + (availableWidth - width) / 2;
  const y = size.marginTop * pixelsPerInch;
  context.drawImage(content, x, y, width, height);
  return page;
}

async function downloadPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The PNG could not be created.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportPrintPages({ filename, format, orientation, pageSelector }: ExportPrintPagesOptions) {
  await nextPaint();
  const sourcePages = await findPages(pageSelector);
  const renderedPages: HTMLCanvasElement[] = [];
  for (const sourcePage of sourcePages) {
    renderedPages.push(placeOnLetterPage(await renderPage(sourcePage, orientation), orientation));
  }

  const safeName = cleanFilename(filename);
  if (format === "png") {
    for (let index = 0; index < renderedPages.length; index += 1) {
      const suffix = renderedPages.length > 1 ? `-page-${index + 1}` : "";
      await downloadPng(renderedPages[index], `${safeName}${suffix}.png`);
    }
    return renderedPages.length;
  }

  const size = PAGE[orientation];
  const pdf = new jsPDF({ format: "letter", orientation, unit: "in" });
  renderedPages.forEach((page, index) => {
    if (index) pdf.addPage("letter", orientation);
    pdf.addImage(page.toDataURL("image/png"), "PNG", 0, 0, size.width, size.height, undefined, "FAST");
  });
  while (pdf.getNumberOfPages() > renderedPages.length) {
    pdf.deletePage(pdf.getNumberOfPages());
  }
  pdf.save(`${safeName}.pdf`);
  return renderedPages.length;
}
