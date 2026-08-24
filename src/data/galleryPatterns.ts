export interface GalleryPattern {
  id: string;
  title: string;
  category: string;
  gridSize: string;
  colorCount: number;
  originalImage: string;
  patternPreviewImage?: string;
  cloudDriveUrl: string;
  cloudDriveLabel?: string;
  cloudDriveText?: string;
  description?: string;
}

/*
 * 手动维护说明：
 * 手动维护图片建议：
 * 1. 源原图放到 public/gallery/originals。
 * 2. 源图纸放到 public/gallery/previews。
 * 3. 页面展示图放到 public/gallery/display，并在下面的 originalImage、patternPreviewImage 中引用 display 目录。
 * 4. display 图建议从源图缩小生成：原图最大边 720px，图纸最大边 1000px。
 * 5. cloudDriveText 用来保存夸克/百度网盘等完整口令文案；复制按钮会优先复制它。
 */
export const galleryPatterns: GalleryPattern[] = [
  {
    id: 'hello-kitty-raincoat',
    title: '雨衣凯蒂猫',
    category: '卡通角色',
    gridSize: '70x70',
    colorCount: 8,
    originalImage: '/gallery/display/hello-kitty-raincoat.jpg',
    patternPreviewImage: '/gallery/display/hello-kitty-raincoat-pattern.jpg',
    cloudDriveUrl: 'https://pan.quark.cn/s/162838efc3f9',
    cloudDriveLabel: '夸克网盘',
    cloudDriveText:
      '打开「夸克APP」即可获取。\n祄并咧闭词并诶喔走看让汢\n/~56653aOzkS~:/\n链接：https://pan.quark.cn/s/162838efc3f9',
    description: '雨伞雨衣造型图纸，总计 2133 颗。',
  },
];
