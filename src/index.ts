import express from "express";
import { defaultResponse, generateImg, type SitVariant } from "./images.js";

const app = express();
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 8000;

// Matches the same set of embed-fetching agents nginx used to gate on
const EMBED_USER_AGENT = /(Intel Mac OS X 11\.6; rv:92\.0|Discord)/i;
const NON_EMBED_REDIRECT = "https://lucas.place/boring/";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const responseCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

function getCached(key: string): Buffer | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.buffer;
}

function setCached(key: string, buffer: Buffer): void {
  responseCache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

// /gifs/{slug} matches Klipy's real GIF page path; /gtfs/{slug} - "gif" with the
// "i" swapped for "t" - is the "double sit" variant, mirroring the sit/double-sit
// s/i/t letter-swap convention this app already uses elsewhere
const SIT_PATH = /^\/(gifs|gtfs)\/([A-Za-z0-9_-]+)$/;

async function handleRequest(name: string): Promise<Buffer | undefined> {
  try {
    const match = SIT_PATH.exec(name);
    if (match) {
      const [, prefix, slug] = match;
      const variant: SitVariant = prefix === "gtfs" ? "double" : "single";
      return await generateImg(slug, variant);
    }
  } catch (e) {
    // We catch errors because we want to show the default image instead of an error page
    console.error(e);
  }
  return undefined;
}

app.get(/.*/, async (req, res) => {
  if (!EMBED_USER_AGENT.test(req.headers["user-agent"] ?? "")) {
    res.redirect(301, NON_EMBED_REDIRECT);
    return;
  }

  res.type("png");
  res.set("Cache-Control", "public, max-age=86400");

  // Filter the name so unicode paths don't error
  let filteredName = req.path.replace(/[^./A-Za-z0-9_-]+/g, "");
  // Filter out language prefixes some clients prepend (e.g. /en/gifs/...)
  filteredName = filteredName.replace(/^\/[A-Za-z-]*\/(gifs|gtfs)/, "/$1");

  const cached = getCached(filteredName);
  if (cached) {
    res.send(cached);
    return;
  }

  const image = (await handleRequest(filteredName)) ?? defaultResponse();
  setCached(filteredName, image);
  res.send(image);
});

app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
