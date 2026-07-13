import api from '@/lib/apiClient';
import type { PaginatedResponse } from '@/types';

export type AuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'AUDIT_READ';

export interface PiiAuditEvent {
  event_uuid: string;
  actor_id: string;
  actor_roles: string[];
  action: AuditAction;
  resource_type: string;
  resource_uuid: string | null;
  fields: string[];
  purpose: string;
  occurred_at: string;
}

export async function fetchAuditEvents(params: {
  page?: number; limit?: number; action?: string; resourceType?: string;
}): Promise<PaginatedResponse<PiiAuditEvent>> {
  const { data } = await api.get<PaginatedResponse<PiiAuditEvent>>('/admin/audit', { params });
  return data;
}
