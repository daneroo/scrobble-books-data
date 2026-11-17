/**
 * `--publish`: uploads a passing run's `goodreads.json` to its one S3
 * object, public-read (infra/s3/). All of S3 lives here: the variables
 * read, the client, the object and its Content-Type. The scrape only calls
 * the upload with the finished file.
 */
import { S3Client } from "bun";

/** The object's key in the bucket. */
const OBJECT_KEY = "goodreads.json";

/** The only variables read, as `secrets/S3.env` names them. */
const NAMES = [
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_REGION",
] as const;

/** The app key and its bucket, from `secrets/S3.env`. */
export type S3Env = Partial<Record<(typeof NAMES)[number], string>>;

/** The S3 variables of `env` (e.g. `process.env`), and no others. */
export function readS3Env(env: Record<string, string | undefined>): S3Env {
  return Object.fromEntries(NAMES.map((name) => [name, env[name]]));
}

/** Uploads the file at `path`; resolves with where it went, or rejects. */
export type Upload = (path: string) => Promise<string>;

/**
 * The upload with the key in `env`, or the names it lacks. No `AWS_*`
 * variable or profile is ever used.
 */
export function s3Upload(
  env: S3Env,
): { ok: true; upload: Upload } | { ok: false; missing: string[] } {
  const missing = NAMES.filter((name) => (env[name] ?? "") === "");
  if (missing.length > 0) return { ok: false, missing };
  const bucket = env.S3_BUCKET ?? "";
  const client = new S3Client({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket,
    region: env.S3_REGION,
  });
  return {
    ok: true,
    upload: async (path) => {
      await client.write(OBJECT_KEY, Bun.file(path), {
        type: "application/json",
      });
      return `s3://${bucket}/${OBJECT_KEY}`;
    },
  };
}
