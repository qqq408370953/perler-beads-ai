import BatchGenerateClient from './BatchGenerateClient';

export const metadata = {
  title: '批量生成拼豆图纸 - 免费拼豆图纸生成器',
  description: '批量上传图片并生成多张拼豆图纸，支持单张参数调整、重新生成、预览和下载。',
};

export default function BatchPage() {
  return <BatchGenerateClient />;
}
