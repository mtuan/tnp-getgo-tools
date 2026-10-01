import { BrowserWindow } from "electron";
import {
  amcIndexUrl,
  amcPaperUrl,
  amcQuizId,
  amcTopicId,
  extractAopsQuestionText,
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
    if (url !== "about:blank" && !url.startsWith(allowedOrigin)) event.preventDefault();
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

const paperArchiveScript = String.raw`(() => {
  const found = new Map();
  for (const anchor of document.querySelectorAll('#mw-content-text a[href], .mw-parser-output a[href]')) {
    const url = new URL(anchor.href, location.href);
    const decoded = decodeURIComponent(url.href).replace(/\+/g, ' ');
    const problemMatch = decoded.match(/(?:title=|index\.php\/)(\d{4})[_ ]([^?#&/]+?)[_ ]Problems(?:[&#/]|$)/i);
    const landingMatch = decoded.match(/(?:title=|index\.php\/)(\d{4})[_ ]([^?#&/]+?)(?:[&#/]|$)/i);
    const match = problemMatch || landingMatch;
    if (!match) continue;
    const contest = match[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+(?:Answer Key|Problems)$/i, '');
    if (!contest || contest.length > 80) continue;
    const year = Number(match[1]);
    const paperUrl = problemMatch ? url.href.split('#')[0] : location.origin + '/wiki/index.php?title=' + encodeURIComponent(year + '_' + contest.replace(/\s+/g, '_') + '_Problems');
    found.set(contest + ':' + year, { contest, year, title: year + ' ' + contest, url: paperUrl });
  }
  return [...found.values()].sort((a, b) => a.contest.localeCompare(b.contest) || b.year - a.year);
})()`;

const contestArchiveLinksScript = String.raw`(() => {
  const links = new Set();
  for (const anchor of document.querySelectorAll('#mw-content-text a[href], .mw-parser-output a[href]')) {
    const url = new URL(anchor.href, location.href);
    const decoded = decodeURIComponent(url.href).replace(/\+/g, ' ');
    if (!/(?:title=|index\.php\/)[^?#&/]*(?:Problems[_ ]and[_ ]Solutions|Problem[_ ]Archive)(?:[&#/]|$)/i.test(decoded)) continue;
    if (url.href === location.href) continue;
    links.add(url.href.split('#')[0]);
  }
  return [...links];
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
  return response.text();
})()`;

const problemParseScript = (sourceUrl: string, html: string) => String.raw`(() => {
  const sourceUrl = ${JSON.stringify(sourceUrl)};
  const article = new DOMParser().parseFromString(${JSON.stringify(html)}, 'text/html');
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
      const source = node.getAttribute('src');
      if (math && /^\[asy\][\s\S]*\[\/asy\]$/i.test(math.trim()) && source)
        return '\n\n[[getgo-aops-image:' + encodeURIComponent(new URL(source, sourceUrl).href) + ']]\n\n';
      if (math) return math;
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
    .replace(/(?:Solutions?|Video Solutions?)\s*$/i, ''));
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
    const found = new Map<string, AmcArchiveEntry>();
    const collectCurrentPage = async () => {
      const entries = await window.webContents.executeJavaScript(paperArchiveScript) as AmcArchiveEntry[];
      for (const entry of entries) found.set(`${entry.contest}:${entry.year}`, entry);
    };
    await collectCurrentPage();
    const archiveLinks = await window.webContents.executeJavaScript(contestArchiveLinksScript) as string[];
    for (const archiveUrl of archiveLinks) {
      await loadWikiPage(window, archiveUrl);
      await collectCurrentPage();
    }
    const entries = [...found.values()].sort((left, right) => left.contest.localeCompare(right.contest, undefined, { numeric: true }) || right.year - left.year);
    if (!entries.length) {
      const diagnostic = await window.webContents.executeJavaScript(String.raw`(() => ({
        url: location.href,
        title: document.title,
        contentRoot: Boolean(document.querySelector('#mw-content-text, .mw-parser-output')),
        anchorCount: document.querySelectorAll('a').length,
        sampleLinks: [...document.querySelectorAll('a')].slice(0, 12).map((anchor) => (anchor.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
      }))()`).catch(() => null) as { url: string; title: string; contentRoot: boolean; anchorCount: number; sampleLinks: string[] } | null;
      throw new Error(`AoPS loaded, but no contest links were found.${diagnostic ? ` Page: "${diagnostic.title}" (${diagnostic.url}); content root: ${diagnostic.contentRoot}; links: ${diagnostic.anchorCount}; samples: ${diagnostic.sampleLinks.join(" | ") || "none"}.` : ""}`);
    }
    return entries;
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

type PreviewProgress = (progress: { processed: number; total: number }) => Promise<void> | void;
type RawQuestion = NonNullable<AmcImportPreview["rawSource"]>["questions"][number];
const imageTokenPattern = /\[\[getgo-aops-image:([^\]]+)\]\]/g;
const imageUrls = (value: string) => [...value.matchAll(imageTokenPattern)].map((match) => decodeURIComponent(match[1]));
const withoutImageTokens = (value: string) => value.replace(imageTokenPattern, "").replace(/\n{3,}/g, "\n\n").trim();

async function parseRawQuestion(window: BrowserWindow, raw: RawQuestion) {
  const extracted = await window.webContents.executeJavaScript(problemParseScript(raw.sourceUrl, raw.html)) as Pick<AmcImportedQuestion, "text" | "solutions">;
  const rawChoices = extractChoiceMap(extracted.text);
  const choiceImageUrls = Object.fromEntries(Object.entries(rawChoices).flatMap(([label, value]) => {
    const urls = imageUrls(value);
    return urls.length === 1 && !withoutImageTokens(value) ? [[label, urls[0]]] : [];
  }));
  const question = {
    id: `q${raw.number}`, number: raw.number, sourceUrl: raw.sourceUrl, text: extracted.text,
    choices: Object.fromEntries(Object.entries(rawChoices).map(([label, value]) => [label, withoutImageTokens(value)])),
    correct: extractCorrectChoice(extracted.solutions), solutions: extracted.solutions,
    imageUrls: imageUrls(extractAopsQuestionText(extracted.text)),
    choiceImageUrls,
  };
  const warnings = [
    ...(!question.solutions.length ? [`Problem ${raw.number}: no solution section found.`] : []),
    ...(!question.correct ? [`Problem ${raw.number}: correct choice could not be detected; review it before publishing.`] : []),
  ];
  return { question, warnings };
}

async function parseRawQuestions(window: BrowserWindow, rawQuestions: RawQuestion[], onProgress?: PreviewProgress) {
  await onProgress?.({ processed: 0, total: rawQuestions.length });
  const questions: AmcImportedQuestion[] = [];
  const warnings: string[] = [];
  for (const raw of rawQuestions) {
    const parsed = await parseRawQuestion(window, raw);
    questions.push(parsed.question);
    warnings.push(...parsed.warnings);
    await onProgress?.({ processed: questions.length, total: rawQuestions.length });
  }
  return { questions, warnings };
}

export async function reparseAmcPreview(preview: AmcImportPreview, onProgress?: PreviewProgress): Promise<AmcImportPreview> {
  if (!preview.rawSource?.questions.length) throw new Error("The cached AMC paper does not contain original source content.");
  const window = createSourceWindow();
  try {
    await window.loadURL("about:blank");
    const parsed = await parseRawQuestions(window, preview.rawSource.questions, onProgress);
    return { ...preview, ...parsed };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

export async function previewAmcPaper(contest: AmcContestName, year: number, onProgress?: PreviewProgress): Promise<AmcImportPreview> {
  const sourcePaperUrl = amcPaperUrl(contest, year);
  const window = createSourceWindow();
  try {
    await loadWikiPage(window, sourcePaperUrl);
    const pageMissing = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.noarticletext'))`).catch(() => false) as boolean;
    if (pageMissing) throw new Error(`${year} ${contest} Problems does not exist on AoPS.`);
    const links = await window.webContents.executeJavaScript(problemLinksScript) as Array<{ number: number; url: string }>;
    if (!links.length) throw new Error("No problem links were found on this AoPS paper page.");
    await onProgress?.({ processed: 0, total: links.length });
    const rawQuestions: RawQuestion[] = [];
    const questions: AmcImportedQuestion[] = [];
    const warnings: string[] = [];
    for (const link of links) {
      // AoPS rate-limits bursts of same-session page reads. Keep requests
      // sequential and human-paced; the in-page fetch also honors 429 retries.
      await pause(1_800 + Math.floor(Math.random() * 700));
      const html = await window.webContents.executeJavaScript(problemFetchScript(link.url)) as string;
      const raw = { number: link.number, sourceUrl: link.url, html };
      rawQuestions.push(raw);
      const parsed = await parseRawQuestion(window, raw);
      questions.push(parsed.question);
      warnings.push(...parsed.warnings);
      await onProgress?.({ processed: questions.length, total: links.length });
    }
    return {
      sourceIndexUrl: amcIndexUrl,
      sourcePaperUrl,
      topic: { id: amcTopicId(contest), title: contest },
      quiz: { id: amcQuizId(contest, year), title: `${year} ${contest}`, year, contest },
      questions,
      warnings,
      rawSource: { capturedAt: new Date().toISOString(), questions: rawQuestions },
    };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
