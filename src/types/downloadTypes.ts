// 下载网格的选项类型定义
export type GridDownloadOptions = {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean; // 新增：是否同时导出CSV hex数据
  includeSocialPreview: boolean; // 是否同时导出适合自媒体发布的预览图
};
