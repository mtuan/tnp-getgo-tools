import { BrowserWindow } from "electron";
import {
  amcIndexUrl,
  amcPaperUrl,
  amcQuizId,
  amcTopicId,
  extractChoiceMap,
  extractCorrectChoice,
  type AmcArchiveEntry,
  type AmcContestName,
  type AmcImportPreview,
  type AmcImportedQuestion,
} from "../domain/amc-import.js";

const partition = "persist:getgo-aops-import";
const allowedOrigin = "https://artofproblemsolving.com";

function createSourceWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 820,
    show: false,
    title: "GetGo · AoPS source",
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedOrigin)) event.preventDefault();
  });
  return window;
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function loadWikiPage(window: BrowserWindow, url: string): Promise<void> {
  if (!url.startsWith(`${allowedOrigin}/wiki/`)) throw new Error("The AoPS source URL is not allowed.");
  // The embedded manual browser uses this same persistent partition. Keep the
  // default Electron user agent because Cloudflare clearance is user-agent bound.
  await window.loadURL(url);
  const deadline = Date.now() + 180_000;
  let verificationShown = false;
  while (Date.now() < deadline && !window.isDestroyed()) {
    const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('#mw-content-text, .mw-parser-output'))`).catch(() => false) as boolean;
    if (ready) {
      if (verificationShown) window.hide();
      return;
    }
    const challenge = await window.webContents.executeJavaScript(`document.title.includes('Just a moment') || Boolean(document.querySelector('#challenge-running, .cf-challenge-running'))`).catch(() => false) as boolean;
    if (challenge && !verificationShown) {
      verificationShown = true;
      window.show();
      window.focus();
    }
    await pause(500);
  }
  throw new Error("AoPS did not finish loading. Complete any verification shown in the AoPS window, then try again.");
}

const archiveScript = String.raw`(() => {
  const contests = new Set(['AMC 8', 'AMC 10A', 'AMC 10B', 'AMC 12A', 'AMC 12B']);
  const found = new Map();
  for (const anchor of document.querySelectorAll('a[href*="title="]')) {
    const label = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const match = label.match(/^(\d{4})\s+(AMC\s+(?:8|10A|10B|12A|12B))\s+Problems$/i);
    if (!match) continue;
    const contest = match[2].toUpperCase().replace(/AMC\s+/, 'AMC ');
    if (!contests.has(contest)) continue;
    const url = new URL(anchor.href, location.href).href;
    found.set(contest + ':' + match[1], { contest, year: Number(match[1]), title: label, url });
  }
  return [...found.values()].sort((a, b) => a.contest.localeCompare(b.contest) || b.year - a.year);
})()`;

const problemLinksScript = String.raw`(() => {
  const found = new Map();
  for (const anchor of document.querySelectorAll('#mw-content-text a[href], .mw-parser-output a[href]')) {
    const decoded = decodeURIComponent(anchor.href);
    const match = decoded.match(/\/Problem[_ ](\d+)(?:[#?]|$)/i);
    if (!match) continue;
    const number = Number(match[1]);
    if (number > 0) found.set(number, new URL(anchor.href, location.href).href.split('#')[0]);
  }
  return [...found].sort((a, b) => a[0] - b[0]).map(([number, url]) => ({ number, url }));
})()`;

const problemFetchScript = (sourceUrl: string) => String.raw`(async () => {
  const sourceUrl = ${JSON.stringify(sourceUrl)};
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(sourceUrl, { credentials: 'include', headers: { accept: 'text/html' } });
    if (response.status !== 429) break;
    if (attempt === 5) break;
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0;
    const dateDelay = retryAfter && !seconds ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
    const backoff = Math.min(30000, 2000 * (2 ** attempt));
    await wait(Math.max(seconds * 1000, dateDelay, backoff) + Math.floor(Math.random() * 750));
  }
  if (!response) throw new Error('AoPS did not return a response for ' + sourceUrl);
  if (!response.ok) throw new Error('AoPS returned HTTP ' + response.status + ' for ' + sourceUrl);
  const article = new DOMParser().parseFromString(await response.text(), 'text/html');
  const root = article.querySelector('.mw-parser-output') || article.querySelector('#mw-content-text');
  if (!root) throw new Error('AoPS returned another security challenge instead of the problem page. Complete verification once, then retry the preview.');
  const clean = (value) => value.replace(/\[edit\]/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const render = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof Element)) return '';
    if (node.matches('script,style,.mw-editsection,.toc,.navbox,.printfooter,.catlinks')) return '';
    if (node.matches('br')) return '\n';
    if (node.matches('img')) {
      const math = node.getAttribute('alt');
      if (math) return math;
      const source = node.getAttribute('src');
      return source ? ' [Image: ' + new URL(source, sourceUrl).href + '] ' : '';
    }
    const content = [...node.childNodes].map(render).join('');
    if (node.matches('p,div,li,table,tr,dl,dd')) return content + '\n';
    if (node.matches('h1,h2,h3,h4')) return '\n' + content + '\n';
    return content;
  };
  const children = [...root.children];
  const isHeading = (element) => element.matches('h2,h3') || Boolean(element.querySelector(':scope > h2, :scope > h3'));
  const headingIndex = children.findIndex((element) => isHeading(element) && /^solution(?:\s|$)/i.test((element.textContent || '').replace(/\[edit\]/g, '').trim()));
  const problemNodes = headingIndex < 0 ? children : children.slice(0, headingIndex);
  const text = clean(problemNodes.map(render).join(' ')
    .replace(/^(?:Problem\s*\d*|Contents)\s*/i, '')
    .replace(/(?:Solution|Video Solution)\s*$/i, ''));
  const solutions = [];
  for (let index = Math.max(0, headingIndex); index < children.length; index += 1) {
    const heading = children[index];
    const title = clean(heading.textContent || '');
    if (!isHeading(heading) || !/^solution(?:\s|$)/i.test(title)) continue;
    const nodes = [];
    for (let cursor = index + 1; cursor < children.length && !isHeading(children[cursor]); cursor += 1) nodes.push(children[cursor]);
    const solutionText = clean(nodes.map(render).join(''));
    if (solutionText) solutions.push({ title, text: solutionText });
  }
  return { text, solutions };
})()`;

export async function discoverAmcArchive(): Promise<AmcArchiveEntry[]> {
  const window = createSourceWindow();
  try {
    await loadWikiPage(window, amcIndexUrl);
    return await window.webContents.executeJavaScript(archiveScript) as AmcArchiveEntry[];
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

export async function previewAmcPaper(contest: AmcContestName, year: number): Promise<AmcImportPreview> {
  const sourcePaperUrl = amcPaperUrl(contest, year);
  const window = createSourceWindow();
  try {
    await loadWikiPage(window, sourcePaperUrl);
    const pageMissing = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.noarticletext'))`).catch(() => false) as boolean;
    if (pageMissing) throw new Error(`${year} ${contest} Problems does not exist on AoPS.`);
    const links = await window.webContents.executeJavaScript(problemLinksScript) as Array<{ number: number; url: string }>;
    if (!links.length) throw new Error("No problem links were found on this AoPS paper page.");
    const questions: AmcImportedQuestion[] = [];
    const warnings: string[] = [];
    for (const link of links) {
      // AoPS rate-limits bursts of same-session page reads. Keep requests
      // sequential and human-paced; the in-page fetch also honors 429 retries.
      await pause(1_800 + Math.floor(Math.random() * 700));
      const extracted = await window.webContents.executeJavaScript(problemFetchScript(link.url)) as Pick<AmcImportedQuestion, "text" | "solutions">;
      const choices = extractChoiceMap(extracted.text);
      const correct = extractCorrectChoice(extracted.solutions);
      if (!extracted.solutions.length) warnings.push(`Problem ${link.number}: no solution section found.`);
      if (!correct) warnings.push(`Problem ${link.number}: correct choice could not be detected; review it before publishing.`);
      questions.push({ id: `q${link.number}`, number: link.number, sourceUrl: link.url, text: extracted.text, choices, correct, solutions: extracted.solutions });
    }
    return {
      sourceIndexUrl: amcIndexUrl,
      sourcePaperUrl,
      topic: { id: amcTopicId(contest), title: contest },
      quiz: { id: amcQuizId(contest, year), title: `${year} ${contest}`, year, contest },
      questions,
      warnings,
    };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
