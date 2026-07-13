import api from '@/lib/apiClient';
import type { ApiResponse } from '@/types';

export type PrivacyRequestStatus = 'RECEIVED' | 'IDENTITY_VERIFIED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'DENIED' | 'FAILED';
export interface PrivacyRequest {
  request_uuid: string; subject_uuid: string; subject_type: 'CLIENT' | 'USER'; request_type: 'ERASURE' | 'EXPORT';
  status: PrivacyRequestStatus; reason: string | null; legal_basis: string | null;
  result: Record<string, unknown>; created_at: string; completed_at: string | null;
}

export async function fetchPrivacyRequests(): Promise<PrivacyRequest[]> {
  const { data } = await api.get<ApiResponse<PrivacyRequest[]>>('/admin/privacy/requests'); return data.data;
}
export async function createPrivacyRequest(payload: { subjectType: 'CLIENT' | 'USER'; subjectUuid: string; requestType: 'ERASURE' | 'EXPORT'; reason?: string }) {
  return api.post('/admin/privacy/requests', payload);
}
export async function denyPrivacyRequest(uuid: string, legalBasis: string, reason: string) {
  return api.patch(`/admin/privacy/requests/${uuid}/deny`, { legalBasis, reason });
}
export async function advancePrivacyRequest(uuid: string, action: 'verify' | 'approve' | 'execute', legalBasis?: string) {
  if (action === 'execute') return api.post<ApiResponse<{ request: PrivacyRequest; exportData?: Record<string, unknown> }>>(`/admin/privacy/requests/${uuid}/execute`);
  return api.patch(`/admin/privacy/requests/${uuid}/${action}`, action === 'approve' ? { legalBasis } : {});
}
