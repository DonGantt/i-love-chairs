import { readFileSync } from "node:fs";
import sharp from "sharp";

const USER_AGENT_HEADERS = {
  "User-Agent": "A Discord Bot by an unknown person using github.com/rebane2001/kltpy-server",
};

const defaultImg = readFileSync("img/sit_default.png");

// img/sitting.png: a photo (top) stacked directly on a flat (0,255,0) "screen"
// block (bottom), both cropped from the same left/right edges. Measured once
// against the actual asset - see the bbox scan this was derived from.
const SITTING_CONTENT = { left: 72, top: 54, width: 1869, height: 2751 };
const SITTING_SCREEN = { left: 0, top: 1131, width: 1869, height: 1620 }; // relative to SITTING_CONTENT
const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = Math.round(SITTING_CONTENT.height * (OUTPUT_WIDTH / SITTING_CONTENT.width));

async function keyOutGreenScreen(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 255 && g > 200 && r < 60 && b < 60) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

const sittingTemplate = await keyOutGreenScreen(
  await sharp("img/sitting.png").extract(SITTING_CONTENT).png().toBuffer(),
);

export function defaultResponse(): Buffer {
  return defaultImg;
}

interface KlipyGifResponse {
  result: boolean;
  data?: { file?: { md?: { gif?: { url?: string } } } };
}

export async function generateImg(name: string): Promise<Buffer> {
  const slug = name.slice(6);
  const lookup = await fetch(`https://api.klipy.co/api/v1/gifs/${slug}`, {
    headers: USER_AGENT_HEADERS,
    signal: AbortSignal.timeout(3000),
  });
  const lookupData = (await lookup.json()) as KlipyGifResponse;
  const imgUrl = lookupData.data?.file?.md?.gif?.url;
  if (!lookupData.result || !imgUrl) throw new Error("could not find klipy image url");
  const imgResp = await fetch(imgUrl, { headers: USER_AGENT_HEADERS, signal: AbortSignal.timeout(3000) });
  const rawGif = Buffer.from(await imgResp.arrayBuffer());

  const gifCover = await sharp(rawGif)
    .resize(SITTING_SCREEN.width, SITTING_SCREEN.height, { fit: "cover" })
    .png()
    .toBuffer();

  const composed = await sharp({
    create: {
      width: SITTING_CONTENT.width,
      height: SITTING_CONTENT.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: gifCover, left: SITTING_SCREEN.left, top: SITTING_SCREEN.top },
      { input: sittingTemplate, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return sharp(composed).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT).png().toBuffer();
}
