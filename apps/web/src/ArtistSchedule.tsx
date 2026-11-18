import { useEffect, useState } from 'react';
import { Clock3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { getMySchedule, saveMySchedule, type WorkSchedule, type WorkWindow } from './api';
import { useI18n } from './i18n';

const timezones=['Europe/Berlin','Europe/Belgrade','Europe/London','Europe/Paris','Europe/Moscow','Europe/Istanbul','UTC','America/New_York','America/Los_Angeles','Asia/Dubai','Asia/Tokyo','Australia/Sydney'];
export default function ArtistSchedule(){
  const {t,language}=useI18n();
  const [schedule,setSchedule]=useState<WorkSchedule>({timezone:'Europe/Berlin',slots:[]});
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  useEffect(()=>{
    let active=true;
    getMySchedule().then(value=>{if(active)setSchedule(value);})
      .catch(()=>{if(active)setError(t('cannotLoad'));})
      .finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;};
  },[t]);
  function add(day:number){
    setSaved(false);
    setSchedule(v=>({...v,slots:[...v.slots,{weekday:day,start:'10:00',end:'18:00'}]}));
  }
  function remove(index:number){
    setSaved(false);setSchedule(v=>({...v,slots:v.slots.filter((_,i)=>i!==index)}));
  }
  function change(index:number,key:'start'|'end',value:string){
    setSaved(false);setSchedule(v=>({...v,slots:v.slots.map((slot,i)=>i===index?{...slot,[key]:value}:slot)}));
  }
  async function save(){
    setBusy(true);setError('');setSaved(false);
    try{setSchedule(await saveMySchedule(schedule));setSaved(true);}
    catch(cause){const code=cause instanceof Error?cause.message:'unknownError';setError(code==='invalid_schedule'?t('scheduleInvalid'):t('cannotLoad'));}
    finally{setBusy(false);}
  }
  function weekday(day:number){
    const date=new Date(Date.UTC(2026,10,16+day));
    return new Intl.DateTimeFormat(language==='sr'?'sr-Latn':language,{weekday:'long',timeZone:'UTC'}).format(date);
  }
  if(!loaded)return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 size={21}/>{t('scheduleTitle')}</CardTitle>
    <CardDescription>{t('scheduleDescription')}</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <div className="space-y-2"><Label htmlFor="schedule-timezone">{t('scheduleTimezone')}</Label>
        <select id="schedule-timezone" value={schedule.timezone} onChange={e=>{setSchedule(v=>({...v,timezone:e.target.value}));setSaved(false);}}
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">
          {[...new Set([...timezones,schedule.timezone])].map(zone=><option key={zone} value={zone}>{zone}</option>)}
        </select><p className="text-xs text-muted-foreground">{t('scheduleTimezoneHint')}</p>
      </div>
      <div className="space-y-3">
        {Array.from({length:7},(_,day)=><div key={day} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium capitalize">{weekday(day)}</h3>
            <Button size="sm" variant="outline" type="button" onClick={()=>add(day)} disabled={schedule.slots.length>=28}><Plus size={15}/>{t('scheduleAddHours')}</Button></div>
          {schedule.slots.map((slot,index)=>slot.weekday===day?<div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div className="space-y-1"><Label htmlFor={'start-'+index}>{t('scheduleFrom')}</Label><Input id={'start-'+index} type="time" value={slot.start} onChange={e=>change(index,'start',e.target.value)}/></div>
            <div className="space-y-1"><Label htmlFor={'end-'+index}>{t('scheduleUntil')}</Label><Input id={'end-'+index} type="time" value={slot.end} onChange={e=>change(index,'end',e.target.value)}/></div>
            <Button type="button" size="icon" variant="ghost" onClick={()=>remove(index)} aria-label={t('scheduleRemoveHours')}><Trash2 size={16}/></Button>
          </div>:null)}
          {!schedule.slots.some((slot:WorkWindow)=>slot.weekday===day)&&<p className="text-xs text-muted-foreground">{t('scheduleDayOff')}</p>}
        </div>)}
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved&&<p role="status" className="text-sm text-green-700">{t('scheduleSaved')}</p>}
      <Button disabled={busy} onClick={()=>void save()}>{busy?t('loading'):t('save')}</Button>
    </CardContent>
  </Card>;
}
