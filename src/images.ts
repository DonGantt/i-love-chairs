import { readFileSync } from "node:fs";
import sharp from "sharp";

const USER_AGENT_HEADERS = {
  "User-Agent": "A Discord Bot by an unknown person using github.com/rebane2001/kltpy-server",
};

const notFoundImgs = [readFileSync("img/notwork1.png"), readFileSync("img/notwork2.png")];

// Both templates share the same canvas size and the same flat (0,255,0)
// "screen" block position/size - only the caption text baked into the photo
// differs. Measured once against the actual assets.
const SITTING_CANVAS = { width: 1682, height: 3214 };
const SITTING_SCREEN = { left: 0, top: 1632, width: 1682, height: 1582 };
const SITTING_SCREEN_ASPECT = SITTING_SCREEN.width / SITTING_SCREEN.height;
const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = Math.round(SITTING_CANVAS.height * (OUTPUT_WIDTH / SITTING_CANVAS.width));

export type SitVariant = "single" | "double";

async function keyOutGreenScreen(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 255 && g > 200 && r < 60 && b < 60) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

const singleTemplate = await keyOutGreenScreen(readFileSync("img/sitting_new.png"));
const doubleTemplate = await keyOutGreenScreen(readFileSync("img/sitting_second.png"));

export function defaultResponse(): Buffer {
  return notFoundImgs[Math.floor(Math.random() * notFoundImgs.length)];
}

interface KlipyGifResponse {
  result: boolean;
  data?: { file?: { md?: { gif?: { url?: string } } } };
}

export async function generateImg(slug: string, variant: SitVariant): Promise<Buffer> {
  const lookup = await fetch(`https://api.klipy.co/api/v1/gifs/${slug}`, {
    headers: USER_AGENT_HEADERS,
    signal: AbortSignal.timeout(3000),
  });
  const lookupData = (await lookup.json()) as KlipyGifResponse;
  const imgUrl = lookupData.data?.file?.md?.gif?.url;
  if (!lookupData.result || !imgUrl) throw new Error("could not find klipy image url");
  const imgResp = await fetch(imgUrl, { headers: USER_AGENT_HEADERS, signal: AbortSignal.timeout(3000) });
  const rawGif = Buffer.from(await imgResp.arrayBuffer());

  const { width: gifWidth, height: gifHeight } = await sharp(rawGif).metadata();
  // Wider-than-the-screen sources get top-anchored (meme captions/faces are usually
  // up top); narrower/portrait sources look fine centered. Either way the full
  // frame stays visible (contain), letterboxed rather than cropped.
  const position = gifWidth! / gifHeight! >= SITTING_SCREEN_ASPECT ? "top" : "centre";

  const gifFit = await sharp(rawGif)
    .resize(SITTING_SCREEN.width, SITTING_SCREEN.height, {
      fit: "contain",
      position,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const sittingTemplate = variant === "double" ? doubleTemplate : singleTemplate;

  const composed = await sharp({
    create: {
      width: SITTING_CANVAS.width,
      height: SITTING_CANVAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: gifFit, left: SITTING_SCREEN.left, top: SITTING_SCREEN.top },
      { input: sittingTemplate, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return sharp(composed).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT).png().toBuffer();
}

// Arbitrary public animated GIF used purely to prototype keeping the source
// animation alive (rather than flattening to the first frame) - swap for
// anything, it's just a testing ground for /test-animate.
const TEST_ANIMATE_GIF_URL = "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif";

export async function generateAnimatedTestImg(variant: SitVariant = "single"): Promise<Buffer> {
  const gifResp = await fetch(TEST_ANIMATE_GIF_URL, {
    headers: USER_AGENT_HEADERS,
    signal: AbortSignal.timeout(5000),
  });
  const rawGif = Buffer.from(await gifResp.arrayBuffer());

  const meta = await sharp(rawGif, { animated: true }).metadata();
  const frameWidth = meta.width!;
  const frameHeight = meta.pageHeight ?? meta.height!;
  const position = frameWidth / frameHeight >= SITTING_SCREEN_ASPECT ? "top" : "centre";

  const sittingTemplate = variant === "double" ? doubleTemplate : singleTemplate;

  // Resize every frame into the screen box, then pad each frame out to the
  // full canvas so the static sitting artwork can be composited on top once -
  // sharp repeats a static overlay across every page of an animated base.
  const composed = await sharp(rawGif, { animated: true })
    .resize(SITTING_SCREEN.width, SITTING_SCREEN.height, {
      fit: "contain",
      position,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: SITTING_SCREEN.top,
      bottom: SITTING_CANVAS.height - SITTING_SCREEN.top - SITTING_SCREEN.height,
      left: SITTING_SCREEN.left,
      right: SITTING_CANVAS.width - SITTING_SCREEN.left - SITTING_SCREEN.width,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .composite([{ input: sittingTemplate, left: 0, top: 0 }])
    .gif()
    .toBuffer();

  return sharp(composed, { animated: true }).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT).gif().toBuffer();
}
