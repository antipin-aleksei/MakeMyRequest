import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getRequest, listRequests, loadReference, updateStatus,
  type RequestDetail, type RequestStatus, type RequestSummary,
} from './api';

const names: Record<RequestStatus, string> = {
  new: 'Новая', in_review: 'На рассмотрении', needs_info: 'Нужны детали',
  accepted: 'Принята', declined: 'Отклонена',
};

function PrivateImage({ token, id, label }: { token: string; id: string; label: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let currentUrl = '';
    loadReference(token, id).then((next) => {
      if (!active) { URL.revokeObjectURL(next); return; }
      currentUrl = next;
      setUrl(next);
    }).catch(() => { if (active) setError('Не удалось загрузить файл'); });
    return () => { active = false; if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [id, token]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!url) return <p className="text-sm text-muted-foreground">Загрузка изображения…</p>;
  return <img src={url} alt={label} className="max-h-72 w-full rounded-md border border-border object-contain" />;
}

export default function Admin() {
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [items, setItems] = useState<RequestSummary[]>([]);
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');

  async function refresh(key = token) {
    setBusy(true); setError('');
    try {
      const records = await listRequests(key);
      setItems(records);
      setToken(key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ошибка загрузки');
      if (!token) setToken('');
    } finally { setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setError('');
    try { setSelected(await getRequest(token, id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка загрузки'); }
    finally { setBusy(false); }
  }
  async function change(status: RequestStatus) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await updateStatus(token, selected.id, status);
      setSelected(await getRequest(token, selected.id));
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка обновления'); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-svh w-full max-w-4xl px-4 py-7 sm:py-12">
    <header className="mb-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><ShieldCheck className="size-7" /><h1 className="text-xl font-semibold">Кабинет мастера</h1></div>
      <a className="text-sm underline" href="/">На главную</a>
    </header>
    {!token ? <Card className="mx-auto max-w-md">
      <CardHeader><CardTitle>Доступ мастера</CardTitle><CardDescription>Введите секретный ключ администратора. Ключ хранится только в памяти этой вкладки.</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void refresh(draftToken); }}>
          <Label htmlFor="admin-token">Ключ доступа</Label>
          <Input id="admin-token" type="password" autoComplete="off" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} required minLength={32} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy || draftToken.length < 32}><KeyRound size={16} /> {busy ? 'Проверяем…' : 'Войти'}</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Для тестового MVP. До публичного запуска потребуется полноценная авторизация.</p>
      </CardContent>
    </Card> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => { setToken(''); setDraftToken(''); setSelected(null); setItems([]); }}>Выйти</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /> Обновить</Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {selected ? <Card>
        <CardHeader>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setSelected(null)}><ArrowLeft size={16} /> К списку</Button>
          <CardTitle>{selected.client_name}</CardTitle>
          <CardDescription>{selected.kind === 'session' ? 'Запрос на сеанс' : 'Консультация'} · {new Date(selected.created_at).toLocaleString('ru-RU')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div><span className="font-medium">Email: </span><a className="underline" href={`mailto:${selected.contact_email}`}>{selected.contact_email}</a></div>
          <div className="whitespace-pre-wrap"><span className="font-medium">Описание: </span>{selected.description}</div>
          {selected.preferred_at && <p>Желаемая дата: {new Date(selected.preferred_at).toLocaleDateString('ru-RU')}</p>}
          <div className="space-y-1"><h3 className="font-semibold">Ответы анкеты</h3>{Object.entries(selected.answers).map(([key, value]) => <p className="break-words text-sm" key={key}><span className="font-medium">{key}: </span>{value ?? 'Не указано'}</p>)}</div>
          {selected.attachments.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Референсы</h3><div className="grid gap-3 sm:grid-cols-2">{selected.attachments.map((file) => <PrivateImage key={file.id} token={token} id={file.id} label={file.filename} />)}</div></section>}
          <div className="space-y-2">
            <Label htmlFor="status">Статус</Label>
            <select id="status" className="h-10 w-full rounded-md border border-border bg-card px-3" value={selected.status} disabled={busy} onChange={(e) => void change(e.target.value as RequestStatus)}>
              {Object.entries(names).map(([status, name]) => <option key={status} value={status}>{name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card> : <Card>
        <CardHeader><CardTitle>Входящие заявки</CardTitle><CardDescription>{items.length} последних заявок</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="filter">Фильтр</Label><select id="filter" className="h-10 w-full rounded-md border border-border bg-card px-3" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Все статусы</option>{Object.entries(names).map(([status, name]) => <option key={status} value={status}>{name}</option>)}
          </select></div>
          {items.filter((item) => filter === 'all' || item.status === filter).map((item) => <button key={item.id} onClick={() => void open(item.id)} className="flex w-full flex-col gap-1 rounded-lg border border-border p-4 text-left hover:bg-muted">
            <span className="flex justify-between gap-2 font-semibold"><span>{item.client_name}</span><span className="text-xs font-normal text-muted-foreground">{names[item.status]}</span></span>
            <span className="line-clamp-2 text-sm text-muted-foreground">{item.description}</span>
          </button>)}
          {!busy && items.length === 0 && <p className="text-sm text-muted-foreground">Новых заявок пока нет.</p>}
          {busy && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        </CardContent>
      </Card>}
    </>}
  </main>;
}
