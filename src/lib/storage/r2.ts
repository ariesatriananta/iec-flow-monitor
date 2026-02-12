import { createHash, createHmac } from "crypto";

type UploadR2Params = {
  key: string;
  body: Buffer;
  contentType: string;
};

type UploadR2Result = {
  key: string;
  url: string;
};

export type R2ListedObject = {
  key: string;
  lastModified: Date | null;
  size: number | null;
};

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";

const readRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} belum di-set`);
  }
  return value;
};

const hashHex = (payload: string | Buffer): string => {
  return createHash("sha256").update(payload).digest("hex");
};

const hmac = (key: Buffer | string, data: string): Buffer => {
  return createHmac("sha256", key).update(data).digest();
};

const formatAmzDate = (date: Date): string => {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
};

const formatDateStamp = (date: Date): string => {
  return formatAmzDate(date).slice(0, 8);
};

const encodeRfc3986 = (value: string): string => {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
};

const normalizeObjectKey = (key: string): string => {
  return key
    .split("/")
    .filter(Boolean)
    .map(encodeRfc3986)
    .join("/");
};

const resolvePublicUrl = (key: string): string => {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  const endpoint = readRequiredEnv("R2_ENDPOINT").replace(/\/+$/, "");
  const bucket = readRequiredEnv("R2_BUCKET");
  return `${endpoint}/${bucket}/${key}`;
};

const resolveR2ObjectUrl = (key: string): URL => {
  const endpoint = readRequiredEnv("R2_ENDPOINT").replace(/\/+$/, "");
  const bucket = readRequiredEnv("R2_BUCKET");
  const accountId = readRequiredEnv("R2_ACCOUNT_ID");
  const encodedKey = normalizeObjectKey(key);
  const url = new URL(`${endpoint}/${bucket}/${encodedKey}`);
  if (!url.host.includes(accountId)) {
    throw new Error("R2 endpoint tidak sesuai dengan R2_ACCOUNT_ID");
  }
  return url;
};

const resolveR2BucketUrl = (): URL => {
  const endpoint = readRequiredEnv("R2_ENDPOINT").replace(/\/+$/, "");
  const bucket = readRequiredEnv("R2_BUCKET");
  const accountId = readRequiredEnv("R2_ACCOUNT_ID");
  const url = new URL(`${endpoint}/${bucket}`);
  if (!url.host.includes(accountId)) {
    throw new Error("R2 endpoint tidak sesuai dengan R2_ACCOUNT_ID");
  }
  return url;
};

const buildCanonicalQueryString = (url: URL): string => {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    pairs.push([encodeRfc3986(key), encodeRfc3986(value)]);
  }
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    return a[0] < b[0] ? -1 : 1;
  });
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
};

const signAndRequestR2 = async ({
  method,
  url,
  body,
  contentType,
}: {
  method: "PUT" | "DELETE" | "GET";
  url: URL;
  body?: Buffer;
  contentType?: string;
}): Promise<Response> => {
  const accessKeyId = readRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readRequiredEnv("R2_SECRET_ACCESS_KEY");

  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = formatDateStamp(now);
  const payloadHash = hashHex(body ?? "");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n");
  const canonicalQuery = buildCanonicalQueryString(url);

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    AWS_ALGORITHM,
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization = `${AWS_ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const requestBody = body
    ? new Blob([Uint8Array.from(body)], { type: contentType })
    : undefined;

  return fetch(url, {
    method,
    headers,
    body: requestBody,
    cache: "no-store",
  });
};

const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

const decodeXmlEntities = (value: string): string => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

const extractXmlTag = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match) return null;
  return decodeXmlEntities(match[1].trim());
};

export const tryResolveObjectKeyFromUrl = (url: string): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const publicBase = process.env.R2_PUBLIC_BASE_URL;

    if (publicBase) {
      const base = new URL(publicBase);
      if (parsed.origin === base.origin) {
        const basePath = stripSlashes(base.pathname);
        const pathname = stripSlashes(parsed.pathname);
        if (!basePath) return pathname || null;
        if (pathname.startsWith(`${basePath}/`)) {
          return pathname.slice(basePath.length + 1) || null;
        }
      }
    }

    const endpoint = readRequiredEnv("R2_ENDPOINT");
    const endpointUrl = new URL(endpoint);
    if (parsed.origin !== endpointUrl.origin) return null;

    const bucket = readRequiredEnv("R2_BUCKET");
    const pathname = stripSlashes(parsed.pathname);
    if (!pathname.startsWith(`${bucket}/`)) return null;
    return pathname.slice(bucket.length + 1) || null;
  } catch {
    return null;
  }
};

export async function uploadBufferToR2({
  key,
  body,
  contentType,
}: UploadR2Params): Promise<UploadR2Result> {
  const response = await signAndRequestR2({
    method: "PUT",
    url: resolveR2ObjectUrl(key),
    body,
    contentType,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Upload R2 gagal (${response.status}): ${bodyText}`);
  }

  return {
    key,
    url: resolvePublicUrl(key),
  };
}

export async function deleteObjectFromR2(key: string): Promise<void> {
  const response = await signAndRequestR2({
    method: "DELETE",
    url: resolveR2ObjectUrl(key),
  });

  if (!response.ok && response.status !== 404) {
    const bodyText = await response.text();
    throw new Error(`Hapus file R2 gagal (${response.status}): ${bodyText}`);
  }
}

export async function listObjectsFromR2(params: {
  prefix: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<{ objects: R2ListedObject[]; nextContinuationToken: string | null }> {
  const url = resolveR2BucketUrl();
  url.searchParams.set("list-type", "2");
  url.searchParams.set("prefix", params.prefix);
  url.searchParams.set("max-keys", String(params.maxKeys ?? 1000));
  if (params.continuationToken) {
    url.searchParams.set("continuation-token", params.continuationToken);
  }

  const response = await signAndRequestR2({
    method: "GET",
    url,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`List object R2 gagal (${response.status}): ${bodyText}`);
  }

  const xml = await response.text();
  const contents = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
  const objects: R2ListedObject[] = contents
    .map((match) => {
      const block = match[1];
      const key = extractXmlTag(block, "Key");
      if (!key) return null;
      const lastModifiedRaw = extractXmlTag(block, "LastModified");
      const sizeRaw = extractXmlTag(block, "Size");
      const lastModified = lastModifiedRaw ? new Date(lastModifiedRaw) : null;
      const size = sizeRaw ? Number(sizeRaw) : null;
      return {
        key,
        lastModified:
          lastModified && !Number.isNaN(lastModified.getTime())
            ? lastModified
            : null,
        size: size !== null && !Number.isNaN(size) ? size : null,
      };
    })
    .filter((item): item is R2ListedObject => Boolean(item));

  const isTruncated = extractXmlTag(xml, "IsTruncated") === "true";
  const nextContinuationToken = isTruncated
    ? extractXmlTag(xml, "NextContinuationToken")
    : null;

  return {
    objects,
    nextContinuationToken: nextContinuationToken || null,
  };
}
