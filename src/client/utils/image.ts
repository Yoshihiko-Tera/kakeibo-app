/**
 * 画像を長辺 maxDimension px 以下・JPEG品質 quality に圧縮し、
 * Gemini API 送信用の Base64（プレフィックスなし）とプレビュー用 DataURL を返す。
 */
export async function compressImageToBase64(
  file: File,
  maxDimension = 1600,
  quality = 0.85,
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("画像のデコードに失敗しました"));
    el.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas の初期化に失敗しました");
  }
  ctx.drawImage(img, 0, 0, width, height);

  const mimeType = "image/jpeg";
  const compressedUrl = canvas.toDataURL(mimeType, quality);
  const base64 = compressedUrl.split(",")[1] ?? "";

  return { base64, mimeType, previewUrl: compressedUrl };
}

export function getTodayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
