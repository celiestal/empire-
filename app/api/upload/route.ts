import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";

/**
 * Gives the browser a short-lived token to upload a finished video straight to
 * Vercel Blob (free storage), so big files don't pass through the server.
 */
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Video storage isn't set up yet" }, { status: 503 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await currentUser();
        if (!user) throw new Error("Log in first");
        const post = clientPayload ? await getStore().get("contentPosts", clientPayload) : null;
        if (!post || post.userId !== user.id) throw new Error("Post not found");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime"],
          maximumSizeInBytes: 300 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
