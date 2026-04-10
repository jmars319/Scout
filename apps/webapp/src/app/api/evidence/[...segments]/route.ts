import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getEvidenceBaseDir } from "@/lib/server/storage/evidence-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getContentType(filePath: string): string {
  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> }
) {
  const { segments } = await context.params;
  const baseDir = getEvidenceBaseDir();
  const relativePath = segments.map((segment) => decodeURIComponent(segment)).join("/");
  const absolutePath = path.resolve(baseDir, relativePath);

  if (!absolutePath.startsWith(baseDir)) {
    return NextResponse.json({ errorMessage: "Invalid evidence path." }, { status: 400 });
  }

  try {
    const buffer = await readFile(absolutePath);
    return new NextResponse(buffer, {
      headers: {
        "content-type": getContentType(absolutePath),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json({ errorMessage: "Evidence not found." }, { status: 404 });
  }
}
