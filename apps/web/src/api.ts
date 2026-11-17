export type RequestKind = 'consultation' | 'session';

export interface IntakeRequest {
  kind: RequestKind;
  client_name: string;
  contact_email: string;
  description: string;
  answers: Record<string, unknown>;
  preferred_at: string | null;
  consent_to_contact: boolean;
}

export interface CreatedRequest {
  id: string;
  status: 'new';
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export async function submitRequest(data: IntakeRequest): Promise<CreatedRequest> {
  const response = await fetch(`${API_BASE}/api/v1/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(response.status === 400
      ? 'Проверьте заполнение полей.'
      : 'Не удалось отправить заявку. Попробуйте позже.');
  }
  return response.json() as Promise<CreatedRequest>;
}
