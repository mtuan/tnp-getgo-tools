#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node validate-package.mjs <page-folder>');

const required = [
  'assets', 'demos', 'htmls', 'design.json', 'generation-manifest.json', 'validation-report.json',
  'demos/portrait-light.png', 'demos/portrait-dark.png',
  'demos/landscape-light.png', 'demos/landscape-dark.png',
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

for (const [name, expected] of Object.entries({
  'portrait-light.png': [393, 852], 'portrait-dark.png': [393, 852],
  'landscape-light.png': [1440, 900], 'landscape-dark.png': [1440, 900],
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
  if (!/prefers-color-scheme|data-theme/i.test(html)) failures.push('responsive.html lacks theme state');
  if (!/aria-pressed/i.test(html)) failures.push('responsive.html lacks an accessible theme toggle');
  if (!/@media[^{}]*(orientation|min-width|max-width)/is.test(html)) failures.push('responsive.html lacks responsive recomposition rules');
}

for (const jsonName of ['design.json', 'generation-manifest.json', 'validation-report.json']) {
  const file = path.join(root, jsonName);
  if (!fs.existsSync(file)) continue;
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${jsonName} is invalid JSON: ${error.message}`); }
}

const manifestFile = path.join(root, 'generation-manifest.json');
if (fs.existsSync(manifestFile)) {
  const manifestText = fs.readFileSync(manifestFile, 'utf8');
  if (/OPENAI_API_KEY|GETGO_AI_OPENAI_API_KEY|DesignAiGenerator|scripts\/image_gen\.py|openai sdk|credentialMode["']?\s*:\s*["']?(?!none)/i.test(manifestText)) {
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
