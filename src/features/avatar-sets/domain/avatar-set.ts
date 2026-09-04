export type AvatarGender = "male" | "female";

export interface AvatarSetAsset {
  id: string;
  gender: AvatarGender;
  filename: string;
  sourcePath: string;
  previewDataUrl: string;
}

export interface AvatarSetPreview {
  id: string;
  name: string;
  avatars: AvatarSetAsset[];
}

export interface AvatarSetLibrary {
  sourcePath: string;
  sets: AvatarSetPreview[];
}

export interface AvatarSetManifestAsset {
  id: string;
  gender: AvatarGender;
  storagePath: string;
  width: 256;
  height: 256;
}

export interface AvatarSetManifest {
  schemaVersion: 1;
  updatedAt: string;
  sets: Array<{
    id: string;
    name: string;
    avatars: AvatarSetManifestAsset[];
  }>;
}

export interface AvatarSetSyncResult {
  setCount: number;
  avatarCount: number;
  syncedAt: string;
  manifestPath: string;
}

export interface AvatarSetDesktopApi {
  chooseAvatarSetsFolder(): Promise<string | null>;
  loadAvatarSets(sourcePath?: string): Promise<AvatarSetLibrary>;
  syncAvatarSets(sourcePath: string): Promise<AvatarSetSyncResult>;
}
