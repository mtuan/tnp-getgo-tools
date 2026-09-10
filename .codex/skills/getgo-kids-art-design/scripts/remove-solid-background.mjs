#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

function usage() {
  console.log(`Usage: node remove-solid-background.mjs <input.png> <output.png> [options]

Convert a flat removal-matte background into real PNG transparency.

Options:
  --matte <hex>       Matte color (default: #8B00FF)
  --tolerance <0-442> Fully transparent color distance (default: 24)
  --softness <1-442>  Anti-aliased transition width (default: 56)
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
  const options = { matte: '#8B00FF', tolerance: 24, softness: 56 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) { positional.push(argument); continue; }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${argument}.`);
    if (argument === '--matte') options.matte = value;
    else if (argument === '--tolerance') options.tolerance = parseNumber(value, argument, { min: 0, max: 442 });
    else if (argument === '--softness') options.softness = parseNumber(value, argument, { min: 1, max: 442 });
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

function removeMatte(png, matte, tolerance, softness) {
  let transparentPixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const distance = Math.hypot(png.data[offset] - matte[0], png.data[offset + 1] - matte[1], png.data[offset + 2] - matte[2]);
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
  const transparentPixels = removeMatte(png, args.matte, args.tolerance, args.softness);
  if (transparentPixels === 0) throw new Error('No fully transparent pixels were produced; verify the matte color or tolerance.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(png));
  const percentage = ((transparentPixels / (png.width * png.height)) * 100).toFixed(2);
  console.log(`Wrote ${output} (${percentage}% fully transparent pixels)`);
}

try { main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
