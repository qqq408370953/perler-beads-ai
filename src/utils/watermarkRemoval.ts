export interface WatermarkSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，无法去水印'));
    img.src = src;
  });
}

export async function removeWatermarkRegion(
  imageSrc: string,
  selection: WatermarkSelection
): Promise<string> {
  const img = await loadImageElement(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('无法创建去水印画布');
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const rectX = Math.max(0, Math.floor((selection.x / 100) * canvas.width));
  const rectY = Math.max(0, Math.floor((selection.y / 100) * canvas.height));
  const rectWidth = Math.max(1, Math.floor((selection.width / 100) * canvas.width));
  const rectHeight = Math.max(1, Math.floor((selection.height / 100) * canvas.height));
  const rectRight = Math.min(canvas.width, rectX + rectWidth);
  const rectBottom = Math.min(canvas.height, rectY + rectHeight);
  const sourceData = new Uint8ClampedArray(data);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getPixel = (x: number, y: number) => {
    const clampedX = clamp(x, 0, canvas.width - 1);
    const clampedY = clamp(y, 0, canvas.height - 1);
    const index = (clampedY * canvas.width + clampedX) * 4;
    return {
      r: sourceData[index],
      g: sourceData[index + 1],
      b: sourceData[index + 2],
    };
  };

  const getPixelStats = (x: number, y: number) => {
    const pixel = getPixel(x, y);
    const max = Math.max(pixel.r, pixel.g, pixel.b);
    const min = Math.min(pixel.r, pixel.g, pixel.b);
    const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;

    return {
      ...pixel,
      x: clamp(x, 0, canvas.width - 1),
      y: clamp(y, 0, canvas.height - 1),
      luma,
      saturation: max - min,
    };
  };

  const isInsideRect = (x: number, y: number) => (
    x >= rectX && x < rectRight && y >= rectY && y < rectBottom
  );

  const samplePadding = Math.max(10, Math.round(Math.min(rectWidth, rectHeight) * 0.35));
  const sampleStep = Math.max(1, Math.floor(Math.min(rectWidth, rectHeight) / 90));
  const ringSamples: ReturnType<typeof getPixelStats>[] = [];

  for (
    let y = Math.max(0, rectY - samplePadding);
    y < Math.min(canvas.height, rectBottom + samplePadding);
    y += sampleStep
  ) {
    for (
      let x = Math.max(0, rectX - samplePadding);
      x < Math.min(canvas.width, rectRight + samplePadding);
      x += sampleStep
    ) {
      if (isInsideRect(x, y)) continue;
      ringSamples.push(getPixelStats(x, y));
    }
  }

  const cleanRingSamples = ringSamples
    .filter((sample) => sample.luma > 190 && sample.saturation < 42)
    .sort((a, b) => b.luma - a.luma);
  const fallbackSamples = ringSamples
    .slice()
    .sort((a, b) => b.luma - a.luma)
    .slice(0, Math.max(1, Math.ceil(ringSamples.length * 0.45)));
  const globalSamples = cleanRingSamples.length >= 8 ? cleanRingSamples : fallbackSamples;
  const safeGlobalSamples = globalSamples.length > 0
    ? globalSamples
    : [{ r: 255, g: 255, b: 255, x: rectX, y: rectY, luma: 255, saturation: 0 }];
  const globalBackground = safeGlobalSamples.reduce(
    (sum, sample) => ({
      r: sum.r + sample.r,
      g: sum.g + sample.g,
      b: sum.b + sample.b,
    }),
    { r: 0, g: 0, b: 0 }
  );
  const globalFill = {
    r: Math.round(globalBackground.r / safeGlobalSamples.length),
    g: Math.round(globalBackground.g / safeGlobalSamples.length),
    b: Math.round(globalBackground.b / safeGlobalSamples.length),
  };

  const getCleanBackgroundSample = (centerX: number, centerY: number) => {
    const samples: ReturnType<typeof getPixelStats>[] = [];
    const sampleRadius = Math.max(3, Math.round(Math.min(rectWidth, rectHeight) * 0.08));

    for (let y = centerY - sampleRadius; y <= centerY + sampleRadius; y++) {
      for (let x = centerX - sampleRadius; x <= centerX + sampleRadius; x++) {
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
        if (isInsideRect(x, y)) continue;
        samples.push(getPixelStats(x, y));
      }
    }

    if (samples.length === 0) return globalFill;

    const backgroundSamples = samples
      .filter((sample) => sample.luma > 190 && sample.saturation < 42)
      .sort((a, b) => b.luma - a.luma);
    const selectedSamples = backgroundSamples.length > 0
      ? backgroundSamples.slice(0, Math.max(1, Math.ceil(backgroundSamples.length * 0.5)))
      : samples.sort((a, b) => b.luma - a.luma).slice(0, Math.max(1, Math.ceil(samples.length * 0.45)));

    const total = selectedSamples.reduce(
      (sum, sample) => ({
        r: sum.r + sample.r,
        g: sum.g + sample.g,
        b: sum.b + sample.b,
      }),
      { r: 0, g: 0, b: 0 }
    );

    return {
      r: Math.round(total.r / selectedSamples.length),
      g: Math.round(total.g / selectedSamples.length),
      b: Math.round(total.b / selectedSamples.length),
    };
  };

  const sampleOutsideRect = (x: number, y: number) => {
    const candidates: Array<{ distance: number; sample: typeof globalFill }> = [];

    if (rectX > 0) {
      candidates.push({
        distance: Math.max(1, x - rectX + 1),
        sample: getCleanBackgroundSample(rectX - 1, y),
      });
    }
    if (rectRight < canvas.width) {
      candidates.push({
        distance: Math.max(1, rectRight - x),
        sample: getCleanBackgroundSample(rectRight, y),
      });
    }
    if (rectY > 0) {
      candidates.push({
        distance: Math.max(1, y - rectY + 1),
        sample: getCleanBackgroundSample(x, rectY - 1),
      });
    }
    if (rectBottom < canvas.height) {
      candidates.push({
        distance: Math.max(1, rectBottom - y),
        sample: getCleanBackgroundSample(x, rectBottom),
      });
    }

    if (candidates.length === 0) return globalFill;

    const weighted = candidates.reduce(
      (sum, candidate) => {
        const weight = 1 / Math.pow(candidate.distance, 1.35);
        return {
          weight: sum.weight + weight,
          r: sum.r + candidate.sample.r * weight,
          g: sum.g + candidate.sample.g * weight,
          b: sum.b + candidate.sample.b * weight,
        };
      },
      { weight: 0, r: 0, g: 0, b: 0 }
    );

    const localFill = {
      r: Math.round(weighted.r / weighted.weight),
      g: Math.round(weighted.g / weighted.weight),
      b: Math.round(weighted.b / weighted.weight),
    };

    return {
      r: Math.round(localFill.r * 0.78 + globalFill.r * 0.22),
      g: Math.round(localFill.g * 0.78 + globalFill.g * 0.22),
      b: Math.round(localFill.b * 0.78 + globalFill.b * 0.22),
    };
  };

  for (let y = rectY; y < rectBottom; y++) {
    for (let x = rectX; x < rectRight; x++) {
      const index = (y * canvas.width + x) * 4;
      const fill = sampleOutsideRect(x, y);
      data[index] = fill.r;
      data[index + 1] = fill.g;
      data[index + 2] = fill.b;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}
