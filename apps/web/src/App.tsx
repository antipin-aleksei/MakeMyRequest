import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, HeartHandshake, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getArtist, submitRequest, uploadReference, type Artist, type RequestKind } from './api';
import Admin from './Admin';

type FormValues = {
  kind: RequestKind; name: string; email: string; description: string;
  style: string; placement: string; size: string; budget: string;
  preferredDate: string; consent: boolean; website: string;
};
const initial: FormValues = {
  kind: 'consultation', name: '', email: '', description: '',
  style: '', placement: '', size: '', budget: '', preferredDate: '',
  consent: false, website: '',
};
const styles = ['Blackwork', 'Графика', 'Реализм', 'Минимализм', 'Олдскул', 'Другое'];
const errorClass = 'text-xs text-destructive';
const allowed = ['image/jpeg', 'image/png', 'image/webp'];
const maxBytes = 5 * 1024 * 1024;

function RequestPage() {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [artistError, setArtistError] = useState('');
  const [values, setValues] = useState<FormValues>(initial);
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    getArtist().then(setArtist).catch(() => setArtistError('Профиль мастера сейчас недоступен.'));
  }, []);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldError(''); setError('');
  }
  function start(kind: RequestKind) { set('kind', kind); setStarted(true); setStep(0); }
  function next() {
    if (values.description.trim().length < 10) {
      setFieldError('Расскажите об идее подробнее (от 10 символов).'); return;
    }
    setFieldError(''); setStep(1);
  }
  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = [...(event.target.files ?? [])];
    if (next.length > 3 || next.some((file) => !allowed.includes(file.type) || file.size > maxBytes || file.size === 0)) {
      setFieldError('Выберите до 3 файлов JPG, PNG или WebP, каждый не более 5 МБ.');
      event.target.value = '';
      return;
    }
    setFiles(next);
    setFieldError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (values.description.trim().length < 10) { setFieldError('Укажите описание от 10 символов.'); setStep(0); return; }
    if (values.name.trim().length < 2) { setFieldError('Укажите имя.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) { setFieldError('Введите корректный email.'); return; }
    if (!values.consent) { setFieldError('Необходимо согласие на обработку заявки.'); return; }

    setSending(true); setError(''); setFieldError(''); setUploadWarning('');
    try {
      const preferred = values.kind === 'session' && values.preferredDate
        ? new Date(`${values.preferredDate}T12:00:00`).toISOString() : null;
      const result = await submitRequest({
        kind: values.kind, client_name: values.name.trim(), contact_email: values.email.trim(),
        description: values.description.trim(), preferred_at: preferred,
        consent_to_contact: values.consent, website: values.website,
        answers: {
          style: values.style || null, placement: values.placement || null,
          size: values.size || null, budget: values.budget ? Number(values.budget) : null,
        },
      });
      setSubmittedId(result.id);
      let failed = 0;
      for (const file of files) {
        try { await uploadReference(result.id, result.upload_token, file); }
        catch { failed += 1; }
      }
      if (failed) setUploadWarning(`Заявка сохранена, но ${failed} файл(ов) не загрузилось. Сообщите мастеру об этом при ответе.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить заявку.');
    } finally { setSending(false); }
  }

  function field(id: keyof FormValues, label: string, input: React.ReactNode, hint?: string) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}{input}</div>;
  }
  function changeText(key: keyof FormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, event.target.value as never);
  }

  return <main className="mx-auto min-h-svh w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:pt-14">
    <header className="mb-9 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><HeartHandshake size={20} /></span><span className="text-lg font-bold tracking-tight">MakeMyRequest</span></div>
      <a href="/admin" className="text-xs text-muted-foreground underline">Для мастера</a>
    </header>
    <section className="mb-7 space-y-3">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Персональная запись</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{artist?.display_name ?? 'Ваш тату-мастер'}</h1>
      {artistError ? <p role="alert" className="text-sm text-destructive">{artistError}</p> : <p className="text-muted-foreground">{artist?.bio ?? 'Загружаем информацию о мастере…'}</p>}
      <p className="text-sm text-muted-foreground">Обсудим идею, размер, расположение и бюджет до встречи. Сеанс подтверждается мастером лично.</p>
    </section>
    {submittedId ? <Card><CardContent className="flex flex-col items-center gap-4 py-10 text-center">
      <CheckCircle2 className="size-12 text-green-700" aria-hidden="true" />
      <h2 className="text-2xl font-semibold">Запрос получен</h2>
      <p className="text-sm text-muted-foreground">Это заявка, а не подтверждённая запись. Мастер свяжется с вами после просмотра.</p>
      {uploadWarning && <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">{uploadWarning}</p>}
      <p className="break-all text-xs text-muted-foreground">Номер заявки: {submittedId}</p>
      <Button variant="outline" onClick={() => { setValues(initial); setStep(0); setStarted(false); setSubmittedId(null); setFiles([]); }}>Создать ещё заявку</Button>
    </CardContent></Card> : !started ? <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col"><CardHeader><CardTitle>Обсудить идею</CardTitle><CardDescription>Есть задумка, но нужна консультация и оценка.</CardDescription></CardHeader><CardContent className="mt-auto"><Button className="w-full" disabled={!artist} onClick={() => start('consultation')}>Оставить запрос <ArrowRight size={16} /></Button></CardContent></Card>
      <Card className="flex flex-col"><CardHeader><CardTitle>Запросить сеанс</CardTitle><CardDescription>Есть конкретный проект и желаемая дата.</CardDescription></CardHeader><CardContent className="mt-auto"><Button className="w-full" disabled={!artist} onClick={() => start('session')}>Выбрать дату <ArrowRight size={16} /></Button></CardContent></Card>
    </div> : <Card>
      <CardHeader><CardTitle>Заявка мастеру</CardTitle>
        <CardDescription>Шаг {step + 1} из 2 — {step === 0 ? 'идея' : 'контакты'}</CardDescription>
        <div className="flex gap-2 pt-2" aria-hidden="true"><span className="h-1.5 flex-1 rounded-full bg-primary" /><span className={`h-1.5 flex-1 rounded-full ${step === 1 ? 'bg-primary' : 'bg-secondary'}`} /></div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{values.kind === 'consultation' ? 'Обсуждение идеи' : 'Запрос на сеанс'}</span><Button type="button" variant="ghost" size="sm" onClick={() => setStarted(false)}>Сменить тип</Button></div>
          {step === 0 ? <>
            {field('description', 'Опишите идею *', <Textarea id="description" value={values.description} onChange={changeText('description')} placeholder="Например, чёрно-белая змея на предплечье..." rows={5} maxLength={5000} required />, 'Стиль, сюжет и важные детали')}
            {field('style', 'Стиль', <select id="style" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={values.style} onChange={changeText('style')}><option value="">Не определился(-ась)</option>{styles.map((item) => <option key={item}>{item}</option>)}</select>)}
            {field('placement', 'Место на теле', <Input id="placement" value={values.placement} onChange={changeText('placement')} placeholder="Предплечье" maxLength={100} />)}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('size', 'Примерный размер', <Input id="size" value={values.size} onChange={changeText('size')} placeholder="15 × 10 см" maxLength={100} />)}
              {field('budget', 'Бюджет (€)', <Input id="budget" type="number" min="0" max="100000" value={values.budget} onChange={changeText('budget')} placeholder="Не знаю" />)}
            </div>
            <div className="space-y-2"><Label htmlFor="files">Референсы (до 3)</Label><Input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} /><p className="text-xs text-muted-foreground">JPG, PNG, WebP до 5 МБ каждый. Не прикладывайте документы или лишние личные данные.</p>
              {files.length > 0 && <p className="text-sm">{files.map((f) => f.name).join(', ')}</p>}
            </div>
            {fieldError && <p role="alert" className={errorClass}>{fieldError}</p>}
            <Button type="button" className="w-full" onClick={next}>Продолжить <ArrowRight size={16} /></Button>
          </> : <>
            {values.kind === 'session' && <>
              {field('preferredDate', 'Предпочтительная дата', <Input id="preferredDate" type="date" value={values.preferredDate} onChange={changeText('preferredDate')} />, 'Это пожелание, а не забронированный слот.')}
              <p className="rounded-md border border-border bg-muted p-3 text-sm">Мастер подтвердит дату и время лично.</p>
            </>}
            {field('name', 'Ваше имя *', <Input id="name" value={values.name} onChange={changeText('name')} maxLength={120} required />)}
            {field('email', 'Email для ответа *', <Input id="email" type="email" value={values.email} onChange={changeText('email')} placeholder="name@example.com" maxLength={254} required />)}
            <div className="absolute left-[-9999px]" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={changeText('website')} /></div>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={values.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-1 size-4 accent-black" /><span>Согласен(-на) на обработку контактных данных и фотографий для ответа на заявку.</span></label>
            {fieldError && <p role="alert" className={errorClass}>{fieldError}</p>}
            {error && <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={() => { setStep(0); setFieldError(''); }}><ArrowLeft size={16} /> Назад</Button><Button type="submit" disabled={sending}><Send size={16} />{sending ? 'Отправляем…' : 'Отправить'}</Button></div>
          </>}
        </form>
      </CardContent>
    </Card>}
    <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground"><Paperclip className="mr-1 inline size-3" />Референсы доступны только мастеру. Перед публичным запуском необходимы политика конфиденциальности, защита от спама и резервное копирование.</p>
  </main>;
}

export default function App() {
  return window.location.pathname.replace(/\/$/, '') === '/admin' ? <Admin /> : <RequestPage />;
}
