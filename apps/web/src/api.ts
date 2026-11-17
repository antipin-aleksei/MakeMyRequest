export type RequestKind = 'consultation' | 'session';
export type RequestStatus = 'new' | 'in_review' | 'needs_info' | 'accepted' | 'declined';

export interface Artist { id: string; display_name: string; bio: string }
export interface IntakeRequest {
  kind: RequestKind;
  client_name: string;
  contact_email: string;
  description: string;
  answers: Record<string, unknown>;
  preferred_at: string | null;
  consent_to_contact: boolean;
  website?: string;
}
export interface CreatedRequest { id: string; status: 'new'; upload_token: string }
export interface Attachment { id: string; filename: string; media_type: string; size_bytes: number }
export interface RequestSummary {
  id: string; kind: RequestKind; status: RequestStatus;
  client_name: string; description: string; created_at: string;
}
export interface RequestDetail extends RequestSummary {
  contact_email: string;
  answers: Record<string, string | number | null>;
  preferred_at: string | null;
  attachments: Attachment[];
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(details?.error === 'attachment_limit'
      ? 'Можно прикрепить максимум 3 изображения.'
      : details?.error === 'unsupported_file'
      ? 'Разрешены только JPG, PNG и WebP.'
      : response.status === 401 ? 'Неверный ключ доступа.'
      : response.status === 413 ? 'Файл слишком большой.'
      : response.status === 400 ? 'Проверьте данные формы.'
      : 'Сервис временно недоступен. Повторите попытку.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }

export async function getArtist() {
  return parse<Artist>(await fetch(`${BASE}/api/v1/artist`));
}
export async function submitRequest(data: IntakeRequest) {
  return parse<CreatedRequest>(await fetch(`${BASE}/api/v1/requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
}
export async function uploadReference(requestId: string, token: string, file: File) {
  const data = new FormData();
  data.append('file', file);
  return parse<Attachment>(await fetch(`${BASE}/api/v1/requests/${requestId}/attachments`, {
    method: 'POST', headers: { 'x-upload-token': token }, body: data,
  }));
}
export async function listRequests(token: string) {
  return parse<RequestSummary[]>(await fetch(`${BASE}/api/v1/admin/requests`, {
    headers: bearer(token),
  }));
}
export async function getRequest(token: string, id: string) {
  return parse<RequestDetail>(await fetch(`${BASE}/api/v1/admin/requests/${id}`, {
    headers: bearer(token),
  }));
}
export async function updateStatus(token: string, id: string, status: RequestStatus) {
  return parse<void>(await fetch(`${BASE}/api/v1/admin/requests/${id}`, {
    method: 'PATCH', headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }));
}
export async function loadReference(token: string, id: string) {
  const response = await fetch(`${BASE}/api/v1/admin/attachments/${id}`, { headers: bearer(token) });
  if (!response.ok) throw new Error('Не удалось загрузить изображение.');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
