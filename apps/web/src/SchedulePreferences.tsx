import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPublicSchedule, type AvailabilityPreference, type WorkSchedule } from './api';
import { useI18n } from './i18n';

export function SchedulePreferences({
  slug,value,onChange,onReady,
}:{
  slug:string;value:AvailabilityPreference[];onChange:(prefs:AvailabilityPreference[])=>void;
  onReady?:(schedule:WorkSchedule|null)=>void;
}){
  const {t,language}=useI18n();
  const [schedule,setSchedule]=useState<WorkSchedule|null>(null);
  const [error,setError]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [range,setRange]=useState<Record<number,boolean>>({});
  useEffect(()=>{
    let active=true;
    getPublicSchedule(slug).then(data=>{if(active){setSchedule(data);onReady?.(data);}})
      .catch(()=>{if(active){setError(true);onReady?.(null);}})
      .finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;};
  },[slug]); // public schedule is loaded once per application visit
  const today=useMemo(()=>{
    try{return new Intl.DateTimeFormat('sv-SE',{timeZone:schedule?.timezone??'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
    catch{return new Date().toISOString().slice(0,10);}
  },[schedule?.timezone]);
  const maxDate=useMemo(()=>{
    const parsed=new Date(today+'T12:00:00Z');
    parsed.setUTCDate(parsed.getUTCDate()+180);
    return parsed.toISOString().slice(0,10);
  },[today]);
  function update(i:number,key:keyof AvailabilityPreference,input:string){
    onChange(value.map((item,index)=>{
      if(index!==i)return item;
      const next={...item,[key]:input};
      if(key==='date_from' && (!range[i] || !item.date_to || item.date_to===item.date_from))
        next.date_to=input;
      return next;
    }));
  }
  function toggleRange(index:number,enabled:boolean){
    setRange(previous=>({...previous,[index]:enabled}));
    if(!enabled)onChange(value.map((pref,i)=>i===index?{...pref,date_to:pref.date_from}:pref));
  }
  function add(){
    const first=schedule?.slots[0];
    onChange([...value,{date_from:'',date_to:'',time_from:first?.start??'10:00',time_to:first?.end??'18:00'}]);
  }
  function weekday(day:number){
    const d=new Date(Date.UTC(2026,10,16+day));
    return new Intl.DateTimeFormat(language==='sr'?'sr-Latn':language,{weekday:'short',timeZone:'UTC'}).format(d);
  }
  if(!loaded)return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if(error)return <p className="text-sm text-destructive">{t('cannotLoad')}</p>;
  if(!schedule?.slots.length)return <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">{t('scheduleUnavailable')}</p>;
  return <section className="space-y-4" aria-label={t('schedulePreferences')}>
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={18}/>{t('schedulePreferences')}</h3>
      <p className="text-xs text-muted-foreground">{t('scheduleRequestDisclaimer')}</p>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-semibold">{t('scheduleWeekdays')} · {schedule.timezone}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Array.from({length:7},(_,day)=><div key={day} className="text-xs">
            <span className="font-medium capitalize">{weekday(day)}: </span>
            {schedule.slots.filter(x=>x.weekday===day).map(x=>x.start+'–'+x.end).join(', ')||'—'}
          </div>)}
        </div>
      </div>
    </div>
    {value.map((pref,i)=><div key={i} className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t('schedulePreferences')} #{i+1}</span>
        <Button type="button" size="sm" variant="ghost" onClick={()=>{onChange(value.filter((_,index)=>index!==i));setRange({});}}><Trash2 size={15}/>{t('scheduleRemovePreference')}</Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs"><input type="radio" name={'range-'+i} checked={!range[i]} onChange={()=>toggleRange(i,false)}/>{t('scheduleSingleDate')}</label>
        <label className="flex cursor-pointer items-center gap-2 text-xs"><input type="radio" name={'range-'+i} checked={Boolean(range[i])} onChange={()=>toggleRange(i,true)}/>{t('scheduleDateRange')}</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={'preference-date-'+i}>{t('scheduleDateFrom')}</Label>
          <Input id={'preference-date-'+i} type="date" required min={today} max={maxDate} value={pref.date_from} onChange={e=>update(i,'date_from',e.target.value)}/></div>
        {range[i]&&<div className="space-y-1"><Label htmlFor={'preference-date-to-'+i}>{t('scheduleDateTo')}</Label>
          <Input id={'preference-date-to-'+i} type="date" required min={pref.date_from||today} max={maxDate} value={pref.date_to} onChange={e=>update(i,'date_to',e.target.value)}/></div>}
        <div className="space-y-1"><Label htmlFor={'preference-from-'+i}>{t('scheduleFrom')}</Label>
          <Input id={'preference-from-'+i} type="time" required step="1800" value={pref.time_from} onChange={e=>update(i,'time_from',e.target.value)}/></div>
        <div className="space-y-1"><Label htmlFor={'preference-to-'+i}>{t('scheduleUntil')}</Label>
          <Input id={'preference-to-'+i} type="time" required step="1800" value={pref.time_to} onChange={e=>update(i,'time_to',e.target.value)}/></div>
      </div>
    </div>)}
    {value.length<3&&<Button type="button" variant="outline" className="w-full" onClick={add}><Plus size={16}/>{t('scheduleAddPreference')}</Button>}
    <p className="text-xs text-muted-foreground">{t('scheduleRequestDisclaimer')}</p>
  </section>;
}
