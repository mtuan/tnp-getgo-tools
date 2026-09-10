#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

function usage() {
  console.log(`Usage: node remove-solid-background.mjs <input.png> <output.png> [options]

Convert a flat or mildly graded removal-matte background into real PNG transparency.

Options:
  --matte <hex>       Matte color (default: #8B00FF)
  --tolerance <0-442> Fully transparent color distance (default: 24)
  --softness <1-442>  Anti-aliased transition width (default: 56)
  --edge-threshold <0-442>
                      Maximum matte distance for edge-connected graded background (default: 120)
  --help              Show this help`);
}

function parseHex(value) {
  const match = /^#?([\da-f]{6})$/i.exec(value);
  if (!match) throw new Error(`Invalid matte color: ${value}. Expected #RRGGBB.`);
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function parseNumber(value, name, { min, max }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}

function parseArgs(argv) {
  if (argv.includes('--help')) return { help: true };
  const positional = [];
  const options = { matte: '#8B00FF', tolerance: 24, softness: 56, edgeThreshold: 120 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) { positional.push(argument); continue; }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${argument}.`);
    if (argument === '--matte') options.matte = value;
    else if (argument === '--tolerance') options.tolerance = parseNumber(value, argument, { min: 0, max: 442 });
    else if (argument === '--softness') options.softness = parseNumber(value, argument, { min: 1, max: 442 });
    else if (argument === '--edge-threshold') options.edgeThreshold = parseNumber(value, argument, { min: 0, max: 442 });
    else throw new Error(`Unknown option: ${argument}`);
    index += 1;
  }
  if (positional.length !== 2) throw new Error('Expected an input PNG and a distinct output PNG.');
  return { ...options, matte: parseHex(options.matte), input: positional[0], output: positional[1] };
}

function decontaminate(channel, matteChannel, coverage) {
  if (coverage <= 0.001) return 0;
  return Math.round(Math.max(0, Math.min(255, (channel - matteChannel * (1 - coverage)) / coverage)));
}

function colorDistance(data, offset, matte) {
  return Math.hypot(data[offset] - matte[0], data[offset + 1] - matte[1], data[offset + 2] - matte[2]);
}

function findEdgeConnectedMatte(png, matte, edgeThreshold) {
  const pixelCount = png.width * png.height;
  const connected = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const visit = index => {
    if (connected[index]) return;
    const offset = index * 4;
    if (png.data[offset + 3] === 0 || colorDistance(png.data, offset, matte) > edgeThreshold) return;
    connected[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < png.width; x += 1) {
    visit(x);
    visit((png.height - 1) * png.width + x);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    visit(y * png.width);
    visit(y * png.width + png.width - 1);
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    if (x > 0) visit(index - 1);
    if (x + 1 < png.width) visit(index + 1);
    if (y > 0) visit(index - png.width);
    if (y + 1 < png.height) visit(index + png.width);
  }
  return connected;
}

function removeMatte(png, matte, tolerance, softness, edgeThreshold) {
  const connectedMatte = findEdgeConnectedMatte(png, matte, edgeThreshold);
  let transparentPixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const pixelIndex = offset / 4;
    if (connectedMatte[pixelIndex]) {
      png.data[offset + 3] = 0;
      transparentPixels += 1;
      continue;
    }
    const distance = colorDistance(png.data, offset, matte);
    const coverage = Math.max(0, Math.min(1, (distance - tolerance) / softness));
    const outputAlpha = (png.data[offset + 3] / 255) * coverage;
    if (outputAlpha < 1) {
      png.data[offset] = decontaminate(png.data[offset], matte[0], coverage);
      png.data[offset + 1] = decontaminate(png.data[offset + 1], matte[1], coverage);
      png.data[offset + 2] = decontaminate(png.data[offset + 2], matte[2], coverage);
    }
    png.data[offset + 3] = Math.round(outputAlpha * 255);
    if (png.data[offset + 3] === 0) transparentPixels += 1;
  }
  return transparentPixels;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const input = path.resolve(args.input);
  const output = path.resolve(args.output);
  if (input === output) throw new Error('Input and output must differ so the matte source is not destroyed accidentally.');
  if (!fs.existsSync(input)) throw new Error(`Input does not exist: ${input}`);
  const png = PNG.sync.read(fs.readFileSync(input));
  if (args.edgeThreshold < args.tolerance) throw new Error('--edge-threshold must be greater than or equal to --tolerance.');
  const transparentPixels = removeMatte(png, args.matte, args.tolerance, args.softness, args.edgeThreshold);
  if (transparentPixels === 0) throw new Error('No fully transparent pixels were produced; verify the matte color or tolerance.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(png));
  const percentage = ((transparentPixels / (png.width * png.height)) * 100).toFixed(2);
  console.log(`Wrote ${output} (${percentage}% fully transparent pixels)`);
}

try { main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
