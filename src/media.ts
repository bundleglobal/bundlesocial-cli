import fs from "node:fs/promises";
import path from "node:path";
import type { CliContext } from "./context";
import { CliError, logStatus } from "./output";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function mimeForPath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Upload a single media reference and return the resulting upload object. The
 * reference is either a public URL (uploaded via `uploadCreateFromUrl`) or a
 * local file path (read from disk and uploaded as multipart form data).
 */
export async function uploadMediaRef(ctx: CliContext, teamId: string, ref: string) {
  if (isUrl(ref)) {
    logStatus(`Uploading media from URL: ${ref}`);
    return ctx.client.upload.uploadCreateFromUrl({ requestBody: { teamId, url: ref.trim() } });
  }

  const absolutePath = path.resolve(ref);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolutePath);
  } catch {
    throw new CliError(
      "MEDIA_NOT_FOUND",
      `Could not read media file "${ref}". Pass a path to a local file or a public https:// URL.`,
      { path: absolutePath },
    );
  }
  const filename = path.basename(absolutePath);
  const mime = mimeForPath(absolutePath);
  logStatus(`Uploading media file: ${absolutePath} (${mime}, ${buffer.byteLength} bytes)`);
  const file = new File([buffer], filename, { type: mime });
  return ctx.client.upload.uploadCreate({ formData: { teamId, file } });
}

/** Upload every reference sequentially and return the array of upload ids. */
export async function uploadMediaRefs(ctx: CliContext, teamId: string, refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs) {
    const upload = await uploadMediaRef(ctx, teamId, ref);
    ids.push(upload.id);
  }
  return ids;
}
