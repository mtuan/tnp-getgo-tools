import { nativeImage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type {
  AvatarGender,
  AvatarSetAsset,
  AvatarSetLibrary,
  AvatarSetManifest,
  AvatarSetPreview,
  AvatarSetSyncResult,
} from "../domain/avatar-set.js";

const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const STORAGE_ROOT = "getgo-avatar-sets";
const MANIFEST_PATH = `${STORAGE_ROOT}/manifest.json`;

const slug = (value: string) => value.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default";

async function isDirectory(directory: string): Promise<boolean> {
  try { return (await fs.stat(directory)).isDirectory(); } catch { return false; }
}

async function genderDirectories(directory: string) {
  const candidates: Array<[AvatarGender, string]> = [
    ["male", "boys"], ["female", "girls"],
  ];
  return (await Promise.all(candidates.map(async ([gender, name]) => ({
    gender, path: path.join(directory, name), exists: await isDirectory(path.join(directory, name)),
  })))).filter(item => item.exists);
}

async function avatarPreview(sourcePath: string): Promise<string> {
  const source = nativeImage.createFromPath(sourcePath);
  if (source.isEmpty()) throw new Error(`Could not read avatar image: ${sourcePath}`);
  return squareThumbnail(source).resize({ width: 128, height: 128, quality: "good" }).toDataURL();
}

function squareThumbnail(source: Electron.NativeImage): Electron.NativeImage {
  const size = source.getSize();
  const edge = Math.min(size.width, size.height);
  return source.crop({
    x: Math.floor((size.width - edge) / 2),
    y: Math.floor((size.height - edge) / 2),
    width: edge,
    height: edge,
  });
}

async function readSet(directory: string, name: string): Promise<AvatarSetPreview> {
  const setId = slug(name);
  const directories = await genderDirectories(directory);
  const avatars: AvatarSetAsset[] = [];
  for (const item of directories) {
    const filenames = (await fs.readdir(item.path)).filter(filename => IMAGE_PATTERN.test(filename)).sort();
    avatars.push(...await Promise.all(filenames.map(async filename => {
      const sourcePath = path.join(item.path, filename);
      return {
        id: `${setId}-${item.gender}-${slug(path.parse(filename).name)}`,
        gender: item.gender,
        filename,
        sourcePath,
        previewDataUrl: await avatarPreview(sourcePath),
      };
    })));
  }
  return { id: setId, name, avatars };
}

export async function loadAvatarSetLibrary(sourcePath: string): Promise<AvatarSetLibrary> {
  const root = path.resolve(sourcePath);
  if (!(await isDirectory(root))) throw new Error(`Avatar folder was not found: ${root}`);
  const rootGenders = await genderDirectories(root);
  const setDirectories = rootGenders.length
    ? [{ directory: root, name: "Default" }]
    : (await fs.readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => ({ directory: path.join(root, entry.name), name: entry.name }));
  const sets = (await Promise.all(setDirectories.map(item => readSet(item.directory, item.name))))
    .filter(set => set.avatars.length > 0);
  if (!sets.length) throw new Error("No avatar sets containing boys/ or girls/ images were found.");
  const setIds = sets.map(set => set.id);
  if (new Set(setIds).size !== setIds.length) throw new Error("Avatar set folder names must produce unique IDs.");
  for (const set of sets) {
    const avatarIds = set.avatars.map(avatar => avatar.id);
    if (new Set(avatarIds).size !== avatarIds.length) throw new Error(`Avatar filenames in “${set.name}” must produce unique IDs.`);
  }
  return { sourcePath: root, sets };
}

export async function syncAvatarSetLibrary(
  library: AvatarSetLibrary,
  firebase: FirebaseAuthService,
): Promise<AvatarSetSyncResult> {
  const syncedAt = new Date().toISOString();
  const sets: AvatarSetManifest["sets"] = [];
  for (const set of library.sets) {
    const avatars: AvatarSetManifest["sets"][number]["avatars"] = [];
    for (const avatar of set.avatars) {
      const image = nativeImage.createFromPath(avatar.sourcePath);
      if (image.isEmpty()) throw new Error(`Could not process avatar image: ${avatar.sourcePath}`);
      const jpeg = squareThumbnail(image).resize({ width: 256, height: 256, quality: "best" }).toJPEG(88);
      const storagePath = `${STORAGE_ROOT}/${set.id}/${avatar.gender}/${avatar.id}.jpg`;
      await firebase.uploadStorageObject(storagePath, jpeg, "image/jpeg");
      avatars.push({ id: avatar.id, gender: avatar.gender, storagePath, width: 256, height: 256 });
    }
    sets.push({ id: set.id, name: set.name, avatars });
  }
  const manifest: AvatarSetManifest = { schemaVersion: 1, updatedAt: syncedAt, sets };
  await firebase.uploadStorageObject(
    MANIFEST_PATH,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    "application/json",
  );
  return {
    setCount: sets.length,
    avatarCount: sets.reduce((sum, set) => sum + set.avatars.length, 0),
    syncedAt,
    manifestPath: MANIFEST_PATH,
  };
}
