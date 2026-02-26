import api from './client';
import type { UploadResult, ImportHistory } from '../types';

interface HistoryItemRaw {
  id: number;
  filename: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  status: 'success' | 'partial' | 'failed';
  logs: {
    total: number;
    inserted: number;
    skipped: number;
    errors: string[];
    skipped_events?: string[];
  };
}

interface PaginatedHistory {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: HistoryItemRaw[];
}

export const filesApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<UploadResult>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  getHistory: (): Promise<ImportHistory[]> =>
    api.get<PaginatedHistory>('/files/history').then((r) =>
      r.data.items.map((item) => ({
        id: item.id,
        filename: item.filename,
        uploaded_by: item.uploaded_by ?? '',
        uploaded_by_name: item.uploaded_by_name ?? null,
        uploaded_at: item.uploaded_at,
        status: item.status,
        inserted_count: item.logs?.inserted ?? 0,
        skipped: item.logs?.skipped ?? 0,
        error_count: item.logs?.errors?.length ?? 0,
        logs: {
          total: item.logs?.total ?? 0,
          inserted: item.logs?.inserted ?? 0,
          skipped: item.logs?.skipped ?? 0,
          errors: item.logs?.errors ?? [],
          skipped_events: item.logs?.skipped_events ?? [],
        },
      }))
    ),
};
