export interface QuizSourceExtractImage {
  id: string;
  page: number;
  asset: string;
  width?: number;
  height?: number;
  sha256?: string;
}

export interface QuizSourceExtraction {
  sourceSha256: string;
  summary: { pages: number; text: number; images: number };
  images: QuizSourceExtractImage[];
}

declare module "./models.js" {
  interface DesktopApi {
    ensureQuizSourceExtraction(manifestPath: string): Promise<QuizSourceExtraction>;
    readQuizSourceExtractImage(manifestPath: string, asset: string): Promise<string>;
    replaceQuizAssetFromSourceExtract(
      manifestPath: string,
      targetReference: string,
      asset: string,
    ): Promise<{ preview: string }>;
    addQuizAssetFromSourceExtract(
      manifestPath: string,
      asset: string,
    ): Promise<{ reference: string; preview: string }>;
  }
}
