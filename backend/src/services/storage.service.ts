import { createHash } from "node:crypto";
import type { EvidenceUploadResult } from "@padala-vision/shared";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase.js";

let bucketEnsured = false;

export class StorageService {
  async uploadEvidenceFile(input: {
    orderId: string;
    riderWallet: string;
    fileName: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<EvidenceUploadResult> {
    const client = getSupabaseAdminClient();
    if (!client) {
      if (!isSupabaseConfigured()) {
        const fileHash = createHash("sha256").update(input.bytes).digest("hex");
        const safeName = sanitizeFilename(input.fileName);
        const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
        const storagePath = `memory/orders/${input.orderId}/${Date.now()}-${fileHash.slice(0, 12)}.${extension}`;

        return {
          storagePath,
          signedUrl: `https://memory.invalid/${storagePath}`,
          fileHash,
          contentType: input.contentType,
        };
      }

      throw new HttpError(500, "Supabase is required for evidence uploads");
    }

    await ensureBucket(client);

    const fileHash = createHash("sha256").update(input.bytes).digest("hex");
    const safeName = sanitizeFilename(input.fileName);
    const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
    const storagePath = `orders/${input.orderId}/${Date.now()}-${fileHash.slice(0, 12)}.${extension}`;

    const { error: uploadError } = await client.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new HttpError(500, `Failed to upload evidence to Supabase Storage: ${uploadError.message}`);
    }

    const { data: signedData, error: signedError } = await client.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError || !signedData?.signedUrl) {
      throw new HttpError(
        500,
        `Failed to create signed URL for evidence upload: ${signedError?.message ?? "unknown error"}`,
      );
    }

    return {
      storagePath,
      signedUrl: signedData.signedUrl,
      fileHash,
      contentType: input.contentType,
    };
  }
}

async function ensureBucket(client: NonNullable<ReturnType<typeof getSupabaseAdminClient>>) {
  if (bucketEnsured) {
    return;
  }

  const { data, error } = await client.storage.listBuckets();
  if (error) {
    throw new HttpError(500, `Failed to list Supabase Storage buckets: ${error.message}`);
  }

  const exists = (data ?? []).some((bucket) => bucket.name === env.SUPABASE_STORAGE_BUCKET);
  if (!exists) {
    const { error: createError } = await client.storage.createBucket(env.SUPABASE_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
    });

    if (createError) {
      throw new HttpError(500, `Failed to create storage bucket: ${createError.message}`);
    }
  }

  bucketEnsured = true;
}

function sanitizeFilename(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}
