import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, HeartHandshake, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { submitRequest, type RequestKind } from './api';

type FormValues = {
  kind: RequestKind;
  name: string;
  email: string;
  description: string;
  style: string;
  placement: string;
  size: string;
  budget: string;
  preferredDate: string;
  consent: boolean;
};

const initial: FormValues = {
  kind: 'consultation', name: '', email: '', description: '',
  style: '', placement: '', size: '', budget: '', preferredDate: '', consent: false,
};
const styles = ['Blackwork', 'Графика', 'Реализм', 'Минимализм', 'Олдскул', 'Другое'];
const fieldClass = 'space-y-2';
const errorClass = 'text-xs text-destructive';

export default function App() {
  const [values, setValues] = useState<FormValues>(initial);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldError('');
    setError('');
  }

  function next() {
    if (values.description.trim().length < 10) {
      setFieldError('Расскажите об идее подробнее (от 10 символов).');
      return;
    }
    setFieldError('');
    setStep(1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (values.description.trim().length < 10) { setFieldError('Укажите описание от 10 символов.'); setStep(0); return; }
    if (values.name.trim().length < 2) { setFieldError('Укажите имя.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) { setFieldError('Введите корректный email.'); return; }
    if (!values.consent) { setFieldError('Необходимо согласие на обработку заявки.'); return; }

    setSending(true);
    setError('');
    setFieldError('');
    try {
      // Desired date only; not a confirmed available slot.
      const preferred = values.kind === 'session' && values.preferredDate
        ? new Date(`${values.preferredDate}T12:00:00`).toISOString() : null;
      const result = await submitRequest({
        kind: values.kind,
        client_name: values.name.trim(),
        contact_email: values.email.trim(),
        description: values.description.trim(),
        preferred_at: preferred,
        consent_to_contact: values.consent,
        answers: {
          style: values.style || null,
          placement: values.placement || null,
          size: values.size || null,
          budget: values.budget ? Number(values.budget) : null,
        },
      });
      setSubmittedId(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить заявку.');
    } finally {
      setSending(false);
    }
  }

  function field(id: keyof FormValues, label: string, input: React.ReactNode, hint?: string) {
    return <div className={fieldClass}><Label htmlFor={id}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}{input}</div>;
  }
  function changeText(key: keyof FormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, event.target.value as never);
  }

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:pt-14">
      <header className="mb-9 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><HeartHandshake size={20} /></span><span className="text-lg font-bold tracking-tight">MakeMyRequest</span></div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">Бета</span>
      </header>
      <div className="mb-7 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Расскажите о своей татуировке</h1>
        <p className="max-w-xl text-muted-foreground">Опишите идею один раз — мастер получит все важные детали в одной заявке.</p>
      </div>
      {submittedId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CheckCircle2 className="size-12 text-green-700" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Запрос получен</h2>
            <p className="text-sm text-muted-foreground">Это заявка, а не подтверждённая запись. Мастер свяжется с вами после просмотра.</p>
            <p className="break-all text-xs text-muted-foreground">Номер заявки: {submittedId}</p>
            <Button variant="outline" onClick={() => { setValues(initial); setStep(0); setSubmittedId(null); }}>Создать ещё заявку</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Заявка мастеру</CardTitle>
            <CardDescription>Шаг {step + 1} из 2 — {step === 0 ? 'идея' : 'контакты'}</CardDescription>
            <div className="flex gap-2 pt-2" aria-hidden="true"><span className="h-1.5 flex-1 rounded-full bg-primary" /><span className={`h-1.5 flex-1 rounded-full ${step === 1 ? 'bg-primary' : 'bg-secondary'}`} /></div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5" noValidate>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Тип заявки</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={values.kind === 'consultation' ? 'default' : 'outline'} className="whitespace-normal" aria-pressed={values.kind === 'consultation'} onClick={() => set('kind', 'consultation')}>Обсудить идею</Button>
                  <Button type="button" variant={values.kind === 'session' ? 'default' : 'outline'} className="whitespace-normal" aria-pressed={values.kind === 'session'} onClick={() => set('kind', 'session')}>Запросить сеанс</Button>
                </div>
              </fieldset>
              {step === 0 ? (
                <>
                  {field('description', 'Опишите вашу идею *', <Textarea id="description" value={values.description} onChange={changeText('description')} placeholder="Например, чёрно-белая змея на предплечье..." rows={5} maxLength={5000} required aria-invalid={Boolean(fieldError)} />, 'Что хотите набить и какие детали важны?')}
                  {field('style', 'Стиль', <select id="style" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={values.style} onChange={changeText('style')}><option value="">Не определился(-ась)</option>{styles.map((style) => <option key={style}>{style}</option>)}</select>)}
                  {field('placement', 'Место на теле', <Input id="placement" value={values.placement} onChange={changeText('placement')} placeholder="Предплечье" maxLength={100} />)}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {field('size', 'Примерный размер', <Input id="size" value={values.size} onChange={changeText('size')} placeholder="15 × 10 см" maxLength={100} />)}
                    {field('budget', 'Бюджет (€)', <Input id="budget" type="number" min="0" max="100000" value={values.budget} onChange={changeText('budget')} placeholder="Не знаю" />)}
                  </div>
                  {fieldError && <p role="alert" className={errorClass}>{fieldError}</p>}
                  <Button type="button" className="w-full" onClick={next}>Продолжить <ArrowRight size={16} /></Button>
                </>
              ) : (
                <>
                  {values.kind === 'session' && <>
                    {field('preferredDate', 'Предпочтительная дата', <Input id="preferredDate" type="date" min={new Date().toLocaleDateString('en-CA')} value={values.preferredDate} onChange={changeText('preferredDate')} />, 'Это пожелание, а не подтверждённое время.')}
                    <p className="rounded-md border border-border bg-muted p-3 text-sm">Мастер подтвердит дату и точное время лично.</p>
                  </>}
                  {field('name', 'Ваше имя *', <Input id="name" value={values.name} onChange={changeText('name')} placeholder="Как к вам обращаться" maxLength={120} required />)}
                  {field('email', 'Email для ответа *', <Input id="email" type="email" value={values.email} onChange={changeText('email')} placeholder="name@example.com" maxLength={254} required />)}
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={values.consent} onChange={(event) => set('consent', event.target.checked)} className="mt-1 size-4 accent-black" /><span>Согласен(-на) на обработку моих данных для рассмотрения заявки и ответа мастера.</span></label>
                  {fieldError && <p role="alert" className={errorClass}>{fieldError}</p>}
                  {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
                  <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={() => { setFieldError(''); setStep(0); }}><ArrowLeft size={16}/> Назад</Button><Button type="submit" disabled={sending}><Send size={16}/>{sending ? 'Отправляем…' : 'Отправить'}</Button></div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}
      <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">Референсы, кабинет мастера и календарь появятся позже. Не публикуйте приложение для реальных клиентов без политики конфиденциальности и защиты от спама.</p>
    </main>
  );
}
