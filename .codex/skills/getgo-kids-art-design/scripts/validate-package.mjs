#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node validate-package.mjs <page-folder>');

const required = [
  'assets', 'index.html', 'index.css', 'index.js',
  'design.json', 'generation-manifest.json', 'validation-report.json',
];
const failures = [];
const htmlSources = new Map();
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);

function pngSize(file) {
  const data = fs.readFileSync(file);
  if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function alphaStats(png, startRow, endRow) {
  const stats = { transparent: 0, partial: 0, total: 0 };
  for (let y = startRow; y < endRow; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha === 0) stats.transparent += 1;
      else if (alpha < 255) stats.partial += 1;
      stats.total += 1;
    }
  }
  return stats;
}

for (const [name, expected] of Object.entries({
  'portrait-light.png': [390, 844], 'portrait-dark.png': [390, 844],
  'landscape-light.png': [1024, 768], 'landscape-dark.png': [1024, 768],
})) {
  const file = path.join(root, 'demos', name);
  if (!fs.existsSync(file)) continue;
  const actual = pngSize(file);
  if (!actual) failures.push(`${name} is not a PNG`);
  else if (actual[0] !== expected[0] || actual[1] !== expected[1]) failures.push(`${name} is ${actual.join('x')}; expected ${expected.join('x')}`);
}

const forbidden = [[/https?:\/\//i, 'remote URL'], [/data:image\//i, 'embedded base64 image'], [/<canvas\b/i, 'canvas']];
const entry = path.join(root, 'index.html');
if (fs.existsSync(entry)) {
  const html = fs.readFileSync(entry, 'utf8');
  htmlSources.set('index.html', html);
  for (const [pattern, label] of forbidden) if (pattern.test(html)) failures.push(`index.html contains ${label}`);
  if (!/<main\b/i.test(html)) failures.push('index.html lacks a semantic main element');
  const sharedStyleIndex = html.search(/<link\b[^>]*href=["']\.\.\/shared\/common\.css["'][^>]*>/i);
  const pageStyleIndex = html.search(/<link\b[^>]*href=["']index\.css["'][^>]*>/i);
  const sharedScriptIndex = html.search(/<script\b[^>]*src=["']\.\.\/shared\/common\.js["'][^>]*>/i);
  const pageScriptIndex = html.search(/<script\b[^>]*src=["']index\.js["'][^>]*>/i);
  if (sharedStyleIndex < 0 || pageStyleIndex < 0) failures.push('index.html must load ../shared/common.css and index.css');
  if (sharedStyleIndex > pageStyleIndex) failures.push('index.html must load shared CSS before page CSS');
  if (sharedScriptIndex < 0 || pageScriptIndex < 0) failures.push('index.html must load ../shared/common.js and index.js');
  if (sharedScriptIndex > pageScriptIndex) failures.push('index.html must load shared JS before page JS');
  const localSources = [html, fs.existsSync(path.join(root, 'index.css')) ? fs.readFileSync(path.join(root, 'index.css'), 'utf8') : '', fs.existsSync(path.join(root, 'index.js')) ? fs.readFileSync(path.join(root, 'index.js'), 'utf8') : ''];
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    if (/^(?:https?:|data:|\/)/i.test(match[1])) continue;
    const dependency = path.resolve(root, match[1]);
    if (fs.existsSync(dependency)) localSources.push(fs.readFileSync(dependency, 'utf8'));
  }
  const combined = localSources.join('\n');
  if (!/prefers-color-scheme|data-theme|bindTheme/i.test(combined)) failures.push('responsive sources lack theme state');
  if (!/aria-pressed/i.test(combined)) failures.push('responsive sources lack an accessible theme toggle');
  if (!/@media[^{}]*(orientation|min-width|max-width)/is.test(combined)) failures.push('responsive sources lack responsive recomposition rules');
}
if (!fs.existsSync(path.resolve(root, '../shared/common.css'))) failures.push('Missing design-level shared/common.css');
if (!fs.existsSync(path.resolve(root, '../shared/common.js'))) failures.push('Missing design-level shared/common.js');
const pageScript = path.join(root, 'index.js');
if (fs.existsSync(pageScript) && /classList\.add\(\s*["']kids-(?:bounded|fullscreen)-page["']/i.test(fs.readFileSync(pageScript, 'utf8'))) failures.push('Shared page shell class must be present in index.html, not added by index.js');

for (const jsonName of ['design.json', 'generation-manifest.json', 'validation-report.json']) {
  const file = path.join(root, jsonName);
  if (!fs.existsSync(file)) continue;
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${jsonName} is invalid JSON: ${error.message}`); }
}

const designFile = path.join(root, 'design.json');
if (fs.existsSync(designFile)) {
  const design = JSON.parse(fs.readFileSync(designFile, 'utf8'));
  const expectedShellClass = design.page?.heightBehavior === 'fullscreen-fixed' ? 'kids-fullscreen-page'
    : design.page?.heightBehavior === 'vertical-scroll' ? 'kids-bounded-page' : null;
  if (!expectedShellClass) {
    failures.push('design.json page.heightBehavior must be fullscreen-fixed or vertical-scroll');
  } else {
    for (const [name, html] of htmlSources) {
      const mainClass = html.match(/<main\b[^>]*class=["']([^"']*)["'][^>]*>/i)?.[1]?.split(/\s+/) ?? [];
      if (!mainClass.includes('page') || !mainClass.includes(expectedShellClass)) {
        failures.push(`${name} main must declare class="page ${expectedShellClass}"`);
      }
    }
  }
  if ((design.theme?.darkOverlay ?? '').replace(/\s+/g, '') !== 'rgba(0,32,27,.72)') {
    failures.push('design.json theme.darkOverlay must be rgba(0, 32, 27, .72)');
  }
  const transparentRoles = /^(?:header|footer|.*(?:decoration|cut).*)$/i;
  const canonicalSizes = {
    portrait: { viewport: [1170, 2532], edgeWidth: 1170 },
    landscape: { viewport: [2048, 1536], edgeWidth: 2048 },
  };
  for (const [orientation, expected] of Object.entries({ portrait: [390, 844], landscape: [1024, 768] })) {
    const viewport = design.viewports?.[orientation];
    if (viewport?.width !== expected[0] || viewport?.height !== expected[1]) {
      failures.push(`design.json ${orientation} viewport is ${viewport ? `${viewport.width}x${viewport.height}` : 'missing'}; expected ${expected.join('x')} CSS pixels`);
    }
  }
  for (const asset of design.assets ?? []) {
    const assetLabel = asset.id ?? asset.file;
    const file = path.resolve(root, asset.file ?? '');
    const intrinsicSize = fs.existsSync(file) ? pngSize(file) : null;
    const declaredSize = asset.dimensions;
    const relevantRole = asset.role === 'header' || asset.role === 'footer' || /^(?:fullscreen|full-page).*background$/i.test(asset.role ?? '');

    if (intrinsicSize && (!Array.isArray(declaredSize) || declaredSize.length !== 2 || declaredSize[0] !== intrinsicSize[0] || declaredSize[1] !== intrinsicSize[1])) {
      failures.push(`${assetLabel} declares ${Array.isArray(declaredSize) ? declaredSize.join('x') : 'no valid dimensions'} but its PNG is ${intrinsicSize.join('x')}`);
    }

    if (relevantRole) {
      const orientations = asset.orientations ?? [];
      if (orientations.length !== 1 || !canonicalSizes[orientations[0]]) {
        failures.push(`${assetLabel} must declare exactly one supported orientation: portrait or landscape`);
      } else if (!intrinsicSize) {
        failures.push(`${assetLabel} must be an inspectable PNG to verify its canonical dimensions`);
      } else {
        const canonical = canonicalSizes[orientations[0]];
        if (asset.role === 'header' || asset.role === 'footer') {
          if (intrinsicSize[0] !== canonical.edgeWidth) failures.push(`${assetLabel} is ${intrinsicSize[0]}px wide; expected ${canonical.edgeWidth}px for ${orientations[0]} edge artwork`);
        } else if (intrinsicSize[0] !== canonical.viewport[0] || intrinsicSize[1] !== canonical.viewport[1]) {
          failures.push(`${assetLabel} is ${intrinsicSize.join('x')}; expected ${canonical.viewport.join('x')} for a ${orientations[0]} fullscreen background`);
        }
      }
    }

    const requiresTransparency = transparentRoles.test(asset.role ?? '');
    const declaresTransparency = asset.backgroundMode === 'transparent';
    if (!requiresTransparency && !declaresTransparency) continue;
    if (asset.backgroundMode !== 'transparent') {
      failures.push(`${assetLabel} must be a final transparent asset, not ${asset.backgroundMode ?? 'an undeclared background mode'}`);
      continue;
    }
    if (!fs.existsSync(file)) {
      failures.push(`${assetLabel} references a missing asset`);
      continue;
    }
    try {
      const png = PNG.sync.read(fs.readFileSync(file));
      let transparentPixels = 0;
      let partialPixels = 0;
      for (let offset = 3; offset < png.data.length; offset += 4) {
        if (png.data[offset] === 0) transparentPixels += 1;
        else if (png.data[offset] < 255) partialPixels += 1;
      }
      if (transparentPixels === 0) failures.push(`${assetLabel} declares transparency but has no fully transparent pixels`);
      if (partialPixels === 0) failures.push(`${assetLabel} lacks partial-alpha anti-aliasing around its painted subject`);
      if (asset.role === 'header' || asset.role === 'footer') {
        const bandHeight = Math.max(1, Math.ceil(png.height * 0.12));
        const isHeader = asset.role === 'header';
        const band = alphaStats(png, isHeader ? png.height - bandHeight : 0, isHeader ? png.height : bandHeight);
        const edge = alphaStats(png, isHeader ? png.height - 1 : 0, isHeader ? png.height : 1);
        if (band.transparent / band.total < 0.1) {
          failures.push(`${assetLabel} lacks a transparent ${isHeader ? 'bottom' : 'top'} transition band`);
        }
        if (edge.transparent / edge.total < 0.8) {
          failures.push(`${assetLabel} has an opaque rectangular seam on its ${isHeader ? 'bottom' : 'top'} boundary`);
        }
      }
    } catch (error) {
      failures.push(`${assetLabel} cannot be inspected as PNG: ${error.message}`);
    }
  }
}

const manifestFile = path.join(root, 'generation-manifest.json');
if (fs.existsSync(manifestFile)) {
  const manifestText = fs.readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(manifestText);
  const credentialModes = [manifest.credentialMode, ...(manifest.outputs ?? []).map(output => output.credentialMode)].filter(Boolean);
  if (/OPENAI_API_KEY|GETGO_AI_OPENAI_API_KEY|DesignAiGenerator|scripts\/image_gen\.py|openai sdk/i.test(manifestText) || credentialModes.some(mode => mode !== 'none')) {
    failures.push('generation-manifest.json references a forbidden API-key, SDK, CLI, or repository-generator path');
  }
  if (!/built-in-image_gen/i.test(manifestText)) failures.push('generation-manifest.json lacks built-in image_gen provenance');
  if (!/["']credentialMode["']\s*:\s*["']none["']/i.test(manifestText)) failures.push('generation-manifest.json must declare credentialMode as none');
}

if (fs.existsSync(path.join(root, 'assets')) && fs.readdirSync(path.join(root, 'assets')).length === 0) failures.push('assets/ is empty');

if (failures.length) {
  console.error(`Package validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Package structure validated: ${root}`);
