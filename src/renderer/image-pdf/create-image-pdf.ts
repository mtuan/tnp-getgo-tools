const maxPageSide = 1600;

async function renderImage(source: { name: string; url: string }): Promise<{ dataUrl: string; width: number; height: number }> {
    const image = new Image();
    image.src = source.url;
    await image.decode();
    const scale = Math.min(1, maxPageSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`Could not render ${source.name}.`);
    context.drawImage(image, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

export async function createImagePdf(images: Array<{ name: string; url: string }>): Promise<ArrayBuffer> {
  if (!images.length) throw new Error("Select at least one image.");
  const { jsPDF } = await import("jspdf");
  const pages = [];
  for (const image of images) pages.push(await renderImage(image));
  const first = pages[0];
  const document = new jsPDF({
    orientation: first.width >= first.height ? "landscape" : "portrait",
    unit: "px",
    format: [first.width, first.height],
    hotfixes: ["px_scaling"],
    compress: true,
  });
  pages.forEach((page, index) => {
    if (index > 0) document.addPage([page.width, page.height], page.width >= page.height ? "landscape" : "portrait");
    document.addImage(page.dataUrl, "PNG", 0, 0, page.width, page.height, undefined, "FAST");
  });
  return document.output("arraybuffer");
}
