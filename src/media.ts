import fs from "node:fs/promises";
import path from "node:path";
import type { UploadInitLargeUploadData } from "bundlesocial";
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

/** Files above this skip the API and go straight to storage (signed PUT), clear of the ~100 MB proxy body limit. */
export const LARGE_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;

type LargeUploadMime = NonNullable<UploadInitLargeUploadData["requestBody"]>["mimeType"];

/** MIME types the large-upload (init) endpoint accepts. */
export const LARGE_UPLOAD_MIME_BY_EXT: Record<string, LargeUploadMime> = {
  ".jpg": "image/jpg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
};

/** init → signed PUT to storage → finalize. Returns the finalized upload object. */
export async function uploadLargeFile(ctx: CliContext, teamId: string, absolutePath: string, buffer: Buffer) {
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = LARGE_UPLOAD_MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new CliError(
      "UNSUPPORTED_MEDIA_TYPE",
      `Files over 90 MB must be ${Object.keys(LARGE_UPLOAD_MIME_BY_EXT).join(", ")} (got "${ext || "no extension"}").`,
    );
  }
  const fileName = path.basename(absolutePath);
  logStatus(`Initializing large upload: ${absolutePath} (${mimeType}, ${buffer.byteLength} bytes)`);
  const init = await ctx.client.upload.uploadInitLargeUpload({ requestBody: { teamId, fileName, mimeType } });
  logStatus(`Uploading ${buffer.byteLength} bytes to storage…`);
  const putResponse = await fetch(init.url, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(buffer.byteLength) },
    body: buffer,
  });
  if (!putResponse.ok) {
    throw new CliError("LARGE_UPLOAD_FAILED", `Upload to storage failed (HTTP ${putResponse.status} ${putResponse.statusText}).`, {
      status: putResponse.status,
    });
  }
  logStatus("Finalizing large upload…");
  return ctx.client.upload.uploadFinalizeLargeUpload({ requestBody: { teamId, path: init.path } });
}

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function mimeForPath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Upload a single media reference and return the resulting upload object. The
 * reference is either a public URL (uploaded via `uploadCreateFromUrl`) or a
 * local file path (read from disk; multipart through the API, or a signed upload above 90 MB).
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
  if (buffer.byteLength > LARGE_UPLOAD_THRESHOLD_BYTES) {
    return uploadLargeFile(ctx, teamId, absolutePath, buffer);
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
