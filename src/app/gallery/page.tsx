import type { Metadata } from 'next';
import GalleryClient from './GalleryClient';

export const metadata: Metadata = {
  title: '图纸广场 | 拼豆AI生成',
  description: '浏览拼豆图纸，复制网盘链接下载保存使用。',
};

export default function GalleryPage() {
  return <GalleryClient />;
}
