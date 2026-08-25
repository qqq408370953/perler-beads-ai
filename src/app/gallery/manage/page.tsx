import type { Metadata } from 'next';
import GalleryManageClient from './GalleryManageClient';

export const metadata: Metadata = {
  title: '图纸管理 | 拼豆AI生成',
  description: '批量上传并维护图纸广场本地图纸记录。',
};

export default function GalleryManagePage() {
  return <GalleryManageClient />;
}
