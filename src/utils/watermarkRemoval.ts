export interface WatermarkSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface PixelStats extends RgbColor {
  luma: number;
  saturation: number;
}

const MAX_PROCESSING_SIDE = 2400;
const MAX_PROCESSING_PIXELS = 4_000_000;
const MAX_RING_SAMPLES = 12_000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，无法去水印'));
    img.src = src;
  });
}

function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch {
          reject(new Error('去水印结果生成失败'));
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('去水印结果读取失败'));
        }
      };
      reader.onerror = () => reject(new Error('去水印结果读取失败'));
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.9);
  });
}

function averageColors(colors: RgbColor[], fallback: RgbColor): RgbColor {
  if (colors.length === 0) return fallback;

  let red = 0;
  let green = 0;
  let blue = 0;
  colors.forEach(color => {
    red += color.r;
    green += color.g;
    blue += color.b;
  });

  return {
    r: Math.round(red / colors.length),
    g: Math.round(green / colors.length),
    b: Math.round(blue / colors.length),
  };
}

function smoothColorLine(colors: RgbColor[], radius: number): RgbColor[] {
  if (colors.length < 2 || radius <= 0) return colors;

  const prefixR = new Float64Array(colors.length + 1);
  const prefixG = new Float64Array(colors.length + 1);
  const prefixB = new Float64Array(colors.length + 1);

  colors.forEach((color, index) => {
    prefixR[index + 1] = prefixR[index] + color.r;
    prefixG[index + 1] = prefixG[index] + color.g;
    prefixB[index + 1] = prefixB[index] + color.b;
  });

  return colors.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(colors.length, index + radius + 1);
    const count = Math.max(1, end - start);
    return {
      r: Math.round((prefixR[end] - prefixR[start]) / count),
      g: Math.round((prefixG[end] - prefixG[start]) / count),
      b: Math.round((prefixB[end] - prefixB[start]) / count),
    };
  });
}

export async function removeWatermarkRegion(
  imageSrc: string,
  selection: WatermarkSelection
): Promise<string> {
  const img = await loadImageElement(imageSrc);
  await yieldToBrowser();

  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const processingScale = Math.min(
    1,
    MAX_PROCESSING_SIDE / Math.max(sourceWidth, sourceHeight),
    Math.sqrt(MAX_PROCESSING_PIXELS / Math.max(1, sourceWidth * sourceHeight))
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * processingScale));
  canvas.height = Math.max(1, Math.round(sourceHeight * processingScale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) throw new Error('无法创建去水印画布');

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const rectX = clamp(Math.floor((selection.x / 100) * canvas.width), 0, canvas.width - 1);
  const rectY = clamp(Math.floor((selection.y / 100) * canvas.height), 0, canvas.height - 1);
  const rectWidth = Math.max(1, Math.floor((selection.width / 100) * canvas.width));
  const rectHeight = Math.max(1, Math.floor((selection.height / 100) * canvas.height));
  const rectRight = Math.min(canvas.width, rectX + rectWidth);
  const rectBottom = Math.min(canvas.height, rectY + rectHeight);
  const targetWidth = rectRight - rectX;
  const targetHeight = rectBottom - rectY;
  const samplePadding = Math.max(8, Math.round(Math.min(targetWidth, targetHeight) * 0.24));
  const sampleLeft = Math.max(0, rectX - samplePadding);
  const sampleTop = Math.max(0, rectY - samplePadding);
  const sampleRight = Math.min(canvas.width, rectRight + samplePadding);
  const sampleBottom = Math.min(canvas.height, rectBottom + samplePadding);
  const sampleWidth = sampleRight - sampleLeft;
  const sampleHeight = sampleBottom - sampleTop;
  const sampleData = ctx.getImageData(sampleLeft, sampleTop, sampleWidth, sampleHeight).data;

  const getPixel = (x: number, y: number): RgbColor => {
    const clampedX = clamp(x, sampleLeft, sampleRight - 1);
    const clampedY = clamp(y, sampleTop, sampleBottom - 1);
    const index = ((clampedY - sampleTop) * sampleWidth + clampedX - sampleLeft) * 4;
    return { r: sampleData[index], g: sampleData[index + 1], b: sampleData[index + 2] };
  };

  const getPixelStats = (x: number, y: number): PixelStats => {
    const pixel = getPixel(x, y);
    const max = Math.max(pixel.r, pixel.g, pixel.b);
    const min = Math.min(pixel.r, pixel.g, pixel.b);
    return {
      ...pixel,
      luma: 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b,
      saturation: max - min,
    };
  };

  const isInsideRect = (x: number, y: number) => (
    x >= rectX && x < rectRight && y >= rectY && y < rectBottom
  );
  const sampleStep = Math.max(1, Math.ceil(Math.sqrt((sampleWidth * sampleHeight) / MAX_RING_SAMPLES)));
  const ringSamples: PixelStats[] = [];

  for (let y = sampleTop; y < sampleBottom; y += sampleStep) {
    for (let x = sampleLeft; x < sampleRight; x += sampleStep) {
      if (!isInsideRect(x, y)) ringSamples.push(getPixelStats(x, y));
    }
  }

  const cleanRingSamples = ringSamples
    .filter(sample => sample.luma > 190 && sample.saturation < 42)
    .sort((a, b) => b.luma - a.luma);
  const fallbackSamples = ringSamples
    .slice()
    .sort((a, b) => b.luma - a.luma)
    .slice(0, Math.max(1, Math.ceil(ringSamples.length * 0.45)));
  const globalSamples = cleanRingSamples.length >= 8 ? cleanRingSamples : fallbackSamples;
  const globalFill = averageColors(globalSamples, { r: 255, g: 255, b: 255 });
  const edgeDepth = Math.max(2, Math.min(6, Math.round(Math.min(targetWidth, targetHeight) * 0.015)));
  const smoothingRadius = Math.max(2, Math.min(18, Math.round(Math.min(targetWidth, targetHeight) * 0.025)));

  const sampleEdgePoint = (
    x: number,
    y: number,
    horizontal: boolean,
    outwardDirection: -1 | 1
  ): RgbColor => {
    const samples: PixelStats[] = [];

    for (let depth = 0; depth < edgeDepth; depth++) {
      for (let crossOffset = -1; crossOffset <= 1; crossOffset++) {
        samples.push(getPixelStats(
          horizontal ? x + crossOffset : x + outwardDirection * depth,
          horizontal ? y + outwardDirection * depth : y + crossOffset
        ));
      }
    }

    const cleanSamples = samples.filter(sample => sample.luma > 190 && sample.saturation < 42);
    const localFill = averageColors(cleanSamples.length > 0 ? cleanSamples : samples, globalFill);
    return {
      r: Math.round(localFill.r * 0.82 + globalFill.r * 0.18),
      g: Math.round(localFill.g * 0.82 + globalFill.g * 0.18),
      b: Math.round(localFill.b * 0.82 + globalFill.b * 0.18),
    };
  };

  const topColors = rectY > 0
    ? smoothColorLine(
      Array.from({ length: targetWidth }, (_, x) => sampleEdgePoint(rectX + x, rectY - 1, true, -1)),
      smoothingRadius
    )
    : null;
  const bottomColors = rectBottom < canvas.height
    ? smoothColorLine(
      Array.from({ length: targetWidth }, (_, x) => sampleEdgePoint(rectX + x, rectBottom, true, 1)),
      smoothingRadius
    )
    : null;
  const leftColors = rectX > 0
    ? smoothColorLine(
      Array.from({ length: targetHeight }, (_, y) => sampleEdgePoint(rectX - 1, rectY + y, false, -1)),
      smoothingRadius
    )
    : null;
  const rightColors = rectRight < canvas.width
    ? smoothColorLine(
      Array.from({ length: targetHeight }, (_, y) => sampleEdgePoint(rectRight, rectY + y, false, 1)),
      smoothingRadius
    )
    : null;

  const leftWeights = Float64Array.from({ length: targetWidth }, (_, x) => 1 / Math.pow(x + 1, 1.35));
  const rightWeights = Float64Array.from({ length: targetWidth }, (_, x) => 1 / Math.pow(targetWidth - x, 1.35));
  const topWeights = Float64Array.from({ length: targetHeight }, (_, y) => 1 / Math.pow(y + 1, 1.35));
  const bottomWeights = Float64Array.from({ length: targetHeight }, (_, y) => 1 / Math.pow(targetHeight - y, 1.35));

  await yieldToBrowser();
  const targetImageData = ctx.getImageData(rectX, rectY, targetWidth, targetHeight);
  const targetData = targetImageData.data;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      let totalWeight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;

      if (leftColors) {
        const weight = leftWeights[x];
        const color = leftColors[y];
        totalWeight += weight;
        red += color.r * weight;
        green += color.g * weight;
        blue += color.b * weight;
      }
      if (rightColors) {
        const weight = rightWeights[x];
        const color = rightColors[y];
        totalWeight += weight;
        red += color.r * weight;
        green += color.g * weight;
        blue += color.b * weight;
      }
      if (topColors) {
        const weight = topWeights[y];
        const color = topColors[x];
        totalWeight += weight;
        red += color.r * weight;
        green += color.g * weight;
        blue += color.b * weight;
      }
      if (bottomColors) {
        const weight = bottomWeights[y];
        const color = bottomColors[x];
        totalWeight += weight;
        red += color.r * weight;
        green += color.g * weight;
        blue += color.b * weight;
      }

      const localRed = totalWeight > 0 ? red / totalWeight : globalFill.r;
      const localGreen = totalWeight > 0 ? green / totalWeight : globalFill.g;
      const localBlue = totalWeight > 0 ? blue / totalWeight : globalFill.b;
      const index = (y * targetWidth + x) * 4;
      targetData[index] = Math.round(localRed * 0.8 + globalFill.r * 0.2);
      targetData[index + 1] = Math.round(localGreen * 0.8 + globalFill.g * 0.2);
      targetData[index + 2] = Math.round(localBlue * 0.8 + globalFill.b * 0.2);
      targetData[index + 3] = 255;
    }

    if (y > 0 && y % 128 === 0) await yieldToBrowser();
  }

  ctx.putImageData(targetImageData, rectX, rectY);
  return canvasToJpegDataUrl(canvas);
}
