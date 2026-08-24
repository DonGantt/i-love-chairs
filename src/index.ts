import express from "express";
import { defaultResponse, generateImg } from "./images.js";

const app = express();
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 8000;

// Matches the same set of embed-fetching agents nginx used to gate on
const EMBED_USER_AGENT = /(Intel Mac OS X 11\.6; rv:92\.0|Discord)/i;
const NON_EMBED_REDIRECT = "https://www.youtube.com/watch?v=ue5NOJpPcO8";

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

async function handleRequest(name: string): Promise<Buffer | undefined> {
  try {
    // /viiw/ and /vitw/
    if (/^\/vi[it]w\/[A-Za-z0-9_-]*$/.test(name)) {
      return await generateImg(name);
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
  // Filter out languages in URL and handle edge-case for english double sit
  filteredName = filteredName.replace(/^\/xn-\.\.\/vi[it]w/, "/vitw");
  filteredName = filteredName.replace(/^\/[A-Za-z-]*\/vi/, "/vi");

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
