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
const SQUIRREL_HEIGHT = Math.round(CANVAS_HEIGHT * 0.5);
const SQUIRREL_TOP_MARGIN = 5;

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

  const canvas = await sharp(rawGif)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .ensureAlpha()
    .toFormat("png")
    .toBuffer();

  const squirrelSource = SQUIRREL_VARIANTS[Math.floor(Math.random() * SQUIRREL_VARIANTS.length)];
  const { data: squirrelBuf, info: squirrelInfo } = await sharp(squirrelSource)
    // Source PNGs carry inconsistent transparent padding above the art itself,
    // so trim it before sizing or the overlay floats away from the top edge
    .trim()
    .resize({ height: SQUIRREL_HEIGHT })
    .png()
    .toBuffer({ resolveWithObject: true });

  return sharp(canvas)
    .composite([
      {
        input: squirrelBuf,
        left: Math.round((CANVAS_WIDTH - squirrelInfo.width) / 2),
        top: SQUIRREL_TOP_MARGIN,
      },
    ])
    .png()
    .toBuffer();
}
