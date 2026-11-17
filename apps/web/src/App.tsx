import { useState } from 'react';
import {
  Alert, Badge, Button, Checkbox, Container, Group, NumberInput, Paper, SegmentedControl,
  Select, Stack, Stepper, Text, Textarea, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { CalendarDays, Check, ClipboardList, HeartHandshake, Send } from 'lucide-react';
import { submitRequest, type RequestKind } from './api';

type FormValues = {
  kind: RequestKind;
  name: string;
  email: string;
  description: string;
  style: string;
  placement: string;
  size: string;
  budget: number | string;
  preferredDate: string;
  consent: boolean;
};

export default function App() {
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const form = useForm<FormValues>({
    initialValues: {
      kind: 'consultation', name: '', email: '', description: '', style: '',
      placement: '', size: '', budget: '', preferredDate: '', consent: false,
    },
    validate: {
      name: (value) => value.trim().length < 2 ? 'Укажите имя' : null,
      email: (value) => !/^\S+@\S+\.\S+$/.test(value) ? 'Введите корректный email' : null,
      description: (value) => value.trim().length < 10 ? 'Расскажите об идее подробнее (от 10 символов)' : null,
      consent: (value) => !value ? 'Необходимо согласие на обработку заявки' : null,
    },
  });

  async function onSubmit(values: FormValues) {
    setSending(true);
    try {
      // Selected date expresses a preference, not a confirmed free slot.
      const preferred = values.kind === 'session' && values.preferredDate
        ? new Date(`${values.preferredDate}T12:00:00`).toISOString()
        : null;
      const result = await submitRequest({
        kind: values.kind,
        client_name: values.name.trim(),
        contact_email: values.email.trim(),
        description: values.description.trim(),
        answers: {
          style: values.style || null,
          placement: values.placement || null,
          size: values.size || null,
          budget: values.budget === '' ? null : Number(values.budget),
        },
        preferred_at: preferred,
        consent_to_contact: values.consent,
      });
      setSubmittedId(result.id);
      notifications.show({ title: 'Заявка отправлена', message: 'Мастер сможет ознакомиться с запросом.', color: 'green' });
    } catch (error) {
      notifications.show({ title: 'Ошибка отправки', message: error instanceof Error ? error.message : 'Ошибка сети', color: 'red' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Container size="sm" py={{ base: 24, sm: 60 }} px="md">
      <Stack gap="xl">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="dark" size="lg" radius="xl"><HeartHandshake size={20} /></ThemeIcon>
            <Text fw={800} size="lg">MakeMyRequest</Text>
          </Group>
          <Badge variant="light" color="gray">Бета</Badge>
        </Group>
        <Stack gap="xs">
          <Title order={1} size="h2">Расскажите о своей татуировке</Title>
          <Text c="dimmed">Опишите идею один раз — мастер получит все важные детали в одной заявке.</Text>
        </Stack>
        {submittedId ? (
          <Paper withBorder radius="lg" p="xl">
            <Stack align="center" gap="md">
              <ThemeIcon color="green" size={64} radius="xl"><Check size={30} /></ThemeIcon>
              <Title order={2} size="h3">Запрос получен</Title>
              <Text ta="center" c="dimmed">Это заявка, а не подтверждённая запись. Мастер свяжется с вами после просмотра.</Text>
              <Text size="xs" c="dimmed">Номер: {submittedId}</Text>
              <Button variant="light" onClick={() => { form.reset(); setSubmittedId(null); setStep(0); }}>Создать ещё заявку</Button>
            </Stack>
          </Paper>
        ) : (
          <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }}>
            <form onSubmit={form.onSubmit(onSubmit)}>
              <Stack gap="lg">
                <SegmentedControl fullWidth value={form.values.kind} onChange={(v) => form.setFieldValue('kind', v as RequestKind)}
                  data={[{ value: 'consultation', label: 'Обсудить идею' }, { value: 'session', label: 'Запросить сеанс' }]} />
                <Stepper active={step} size="sm" allowNextStepsSelect={false}>
                  <Stepper.Step label="Идея" icon={<ClipboardList size={18} />}>
                    <Stack mt="lg">
                      <Textarea label="Опишите вашу идею" description="Что хотите набить, в каком стиле, какие детали важны?" placeholder="Например, чёрно-белая змея на предплечье..." required minRows={4} autosize maxRows={9} {...form.getInputProps('description')} />
                      <Select label="Стиль" placeholder="Не определился(-ась)" clearable data={['Blackwork', 'Графика', 'Реализм', 'Минимализм', 'Олдскул', 'Другое']} {...form.getInputProps('style')} />
                      <TextInput label="Место на теле" placeholder="Например, предплечье" {...form.getInputProps('placement')} />
                      <Group grow align="start">
                        <TextInput label="Примерный размер" placeholder="15 × 10 см" {...form.getInputProps('size')} />
                        <NumberInput label="Бюджет (€)" placeholder="Не знаю" min={0} max={100000} {...form.getInputProps('budget')} />
                      </Group>
                      <Button onClick={() => setStep(1)} fullWidth>Продолжить</Button>
                    </Stack>
                  </Stepper.Step>
                  <Stepper.Step label="Контакты" icon={<CalendarDays size={18} />}>
                    <Stack mt="lg">
                      {form.values.kind === 'session' && (
                        <>
                          <TextInput type="date" label="Предпочтительная дата" description="Это пожелание, а не подтверждённое время" {...form.getInputProps('preferredDate')} />
                          <Alert color="blue">Мастер подтвердит дату и точное время лично.</Alert>
                        </>
                      )}
                      <TextInput label="Ваше имя" placeholder="Как к вам обращаться" required {...form.getInputProps('name')} />
                      <TextInput label="Email для ответа" type="email" placeholder="name@example.com" required {...form.getInputProps('email')} />
                      <Checkbox label="Согласен(-на) на использование моих данных для обработки заявки и ответа мастера" {...form.getInputProps('consent', { type: 'checkbox' })} />
                      {form.errors.consent && <Text size="xs" c="red">{form.errors.consent}</Text>}
                      <Group grow>
                        <Button variant="default" onClick={() => setStep(0)}>Назад</Button>
                        <Button type="submit" loading={sending} leftSection={<Send size={16} />}>Отправить запрос</Button>
                      </Group>
                    </Stack>
                  </Stepper.Step>
                </Stepper>
              </Stack>
            </form>
          </Paper>
        )}
        <Text c="dimmed" size="xs" ta="center">Фотографии, личный кабинет мастера и живой календарь появятся в следующих версиях. Не публикуйте приложение для реальных клиентов без политики конфиденциальности и защиты от спама.</Text>
      </Stack>
    </Container>
  );
}
