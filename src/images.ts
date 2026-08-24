import { readFileSync } from "node:fs";
import sharp from "sharp";

const USER_AGENT_HEADERS = {
  "User-Agent": "A Discord Bot by an unknown person using github.com/rebane2001/kltpy-server",
};

const defaultImg = readFileSync("img/sit_default.png");

const SQUIRREL_VARIANTS = [
  "angry_squirrel.png",
  "angry_squirrel_hat.png",
  "angry_squirrel_hat_coat.png",
  "angry_squirrel_mask.png",
  "angry_squirrel_mask_n_hat.png",
  "angry_squirrel_mask_n_hat_n_coat.png",
].map((file) => readFileSync(`img/${file}`));

const CANVAS_WIDTH = 350;
const CANVAS_HEIGHT = 185;

export function defaultResponse(): Buffer {
  return defaultImg;
}

async function findTenorViewPath(query: string): Promise<string> {
  const r = await fetch(`https://tenor.com/search/${query}-gifs`, {
    headers: USER_AGENT_HEADERS,
    signal: AbortSignal.timeout(3000),
  });
  const html = await r.text();
  const match = html.match(/href="(\/view\/[A-Za-z0-9-]+)"/);
  if (!match) throw new Error("no tenor search results for query");
  return match[1];
}

async function scrapeTenorImageUrl(viewPath: string): Promise<string> {
  const r = await fetch(`https://tenor.com${viewPath}`, {
    headers: USER_AGENT_HEADERS,
    signal: AbortSignal.timeout(3000),
  });
  const html = await r.text();
  const match = html.match(/<meta class="dynamic" name="twitter:image" content="([^"]*)">/);
  if (!match) throw new Error("could not find tenor image url");
  return match[1];
}

export async function generateImg(name: string): Promise<Buffer> {
  // Klipy slugs end in a disambiguating index (e.g. "-19") that isn't part of the title
  const query = name.slice(6).replace(/-\d+$/, "");
  const viewPath = await findTenorViewPath(query);
  const imgUrl = await scrapeTenorImageUrl(viewPath);
  const imgResp = await fetch(imgUrl, { headers: USER_AGENT_HEADERS, signal: AbortSignal.timeout(3000) });
  const rawGif = Buffer.from(await imgResp.arrayBuffer());

  const canvas = await sharp(rawGif)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .ensureAlpha()
    .toFormat("png")
    .toBuffer();

  const squirrelWidth = Math.round(CANVAS_WIDTH * 0.45);

  const squirrelSource = SQUIRREL_VARIANTS[Math.floor(Math.random() * SQUIRREL_VARIANTS.length)];
  const { data: squirrelBuf, info: squirrelInfo } = await sharp(squirrelSource)
    .resize({ width: squirrelWidth, height: CANVAS_HEIGHT, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });

  return sharp(canvas)
    .composite([
      {
        input: squirrelBuf,
        left: Math.round((CANVAS_WIDTH - squirrelInfo.width) / 2),
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}
