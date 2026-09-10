#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node validate-package.mjs <page-folder>');

const required = [
  'assets', 'htmls', 'design.json', 'generation-manifest.json', 'validation-report.json',
  'htmls/portrait-light.html', 'htmls/portrait-dark.html',
  'htmls/landscape-light.html', 'htmls/landscape-dark.html', 'htmls/responsive.html',
];
const failures = [];
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
for (const name of ['portrait-light.html', 'portrait-dark.html', 'landscape-light.html', 'landscape-dark.html', 'responsive.html']) {
  const file = path.join(root, 'htmls', name);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  for (const [pattern, label] of forbidden) if (pattern.test(html)) failures.push(`${name} contains ${label}`);
  if (!/<main\b/i.test(html)) failures.push(`${name} lacks a semantic main element`);
}

const responsive = path.join(root, 'htmls', 'responsive.html');
if (fs.existsSync(responsive)) {
  const html = fs.readFileSync(responsive, 'utf8');
  const localSources = [html];
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    if (/^(?:https?:|data:|\/)/i.test(match[1])) continue;
    const dependency = path.resolve(path.dirname(responsive), match[1]);
    if (fs.existsSync(dependency)) localSources.push(fs.readFileSync(dependency, 'utf8'));
  }
  const combined = localSources.join('\n');
  if (!/prefers-color-scheme|data-theme/i.test(combined)) failures.push('responsive sources lack theme state');
  if (!/aria-pressed/i.test(combined)) failures.push('responsive sources lack an accessible theme toggle');
  if (!/@media[^{}]*(orientation|min-width|max-width)/is.test(combined)) failures.push('responsive sources lack responsive recomposition rules');
}

for (const jsonName of ['design.json', 'generation-manifest.json', 'validation-report.json']) {
  const file = path.join(root, jsonName);
  if (!fs.existsSync(file)) continue;
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${jsonName} is invalid JSON: ${error.message}`); }
}

const designFile = path.join(root, 'design.json');
if (fs.existsSync(designFile)) {
  const design = JSON.parse(fs.readFileSync(designFile, 'utf8'));
  const transparentRoles = /^(?:header|footer|.*(?:decoration|cut).*)$/i;
  const canonicalSizes = {
    portrait: { viewport: [1170, 2532], edgeWidth: 1170 },
    landscape: { viewport: [2048, 1536], edgeWidth: 2048 },
  };
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
