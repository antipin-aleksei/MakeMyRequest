import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPublicSchedule, type AvailabilityPreference, type WorkSchedule } from './api';
import { useI18n } from './i18n';

const MINUTE=60_000;
function toMinutes(time:string):number {
  const [hours,minutes]=time.split(':').map(Number);
  return hours*60+minutes;
}
function asTime(minutes:number):string {
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
export function getSelectableTimes(schedule:WorkSchedule, dateFrom:string, dateTo:string):Array<{from:string;to:string}> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(dateTo))return [];
  const start=Date.parse(dateFrom+'T00:00:00Z'),end=Date.parse(dateTo+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>30*24*60*MINUTE)return [];
  const options=new Map<string,{from:string;to:string}>();
  for(let day=start;day<=end;day+=24*60*MINUTE){
    const weekday=(new Date(day).getUTCDay()+6)%7;
    for(const slot of schedule.slots.filter(item=>item.weekday===weekday)){
      const startMinute=toMinutes(slot.start),endMinute=toMinutes(slot.end);
      if(!Number.isFinite(startMinute)||!Number.isFinite(endMinute)||endMinute<=startMinute)continue;
      const duration=endMinute-startMinute>=60?60:30;
      for(let minute=startMinute;minute+duration<=endMinute;minute+=30){
        const option={from:asTime(minute),to:asTime(minute+duration)};
        options.set(option.from+'-'+option.to,option);
      }
    }
  }
  return [...options.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
}

export function SchedulePreferences({slug,value,onChange}:{
  slug:string;value:AvailabilityPreference[];onChange:(prefs:AvailabilityPreference[])=>void;
}){
  const {t,language}=useI18n();
  const [schedule,setSchedule]=useState<WorkSchedule|null>(null);
  const [error,setError]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [range,setRange]=useState<Record<number,boolean>>({});
  useEffect(()=>{
    let active=true;
    getPublicSchedule(slug).then(data=>{if(active)setSchedule(data);})
      .catch(()=>{if(active)setError(true);})
      .finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;};
  },[slug]);
  const today=useMemo(()=>{
    try{return new Intl.DateTimeFormat('sv-SE',{timeZone:schedule?.timezone??'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
    catch{return new Date().toISOString().slice(0,10);}
  },[schedule?.timezone]);
  const maxDate=useMemo(()=>{
    const next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+180);
    return next.toISOString().slice(0,10);
  },[today]);
  function updateDate(index:number,key:'date_from'|'date_to',input:string) {
    onChange(value.map((pref,i)=>{
      if(i!==index)return pref;
      const from=key==='date_from'?input:pref.date_from;
      const to=key==='date_to'?input:(!range[index]?input:(pref.date_to<from?from:pref.date_to));
      return {...pref,date_from:from,date_to:to,time_from:'',time_to:''};
    }));
  }
  function toggleRange(index:number,enabled:boolean){
    setRange(previous=>({...previous,[index]:enabled}));
    onChange(value.map((pref,i)=>i===index?{...pref,date_to:enabled?pref.date_to:pref.date_from,time_from:'',time_to:''}:pref));
  }
  function add(){
    onChange([...value,{date_from:'',date_to:'',time_from:'',time_to:''}]);
  }
  function weekday(day:number){
    const date=new Date(Date.UTC(2026,10,16+day));
    return new Intl.DateTimeFormat(language==='sr'?'sr-Latn':language,{weekday:'short',timeZone:'UTC'}).format(date);
  }
  if(!loaded)return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if(error)return <p role="alert" className="text-sm text-destructive">{t('cannotLoad')}</p>;
  if(!schedule?.slots.length)return <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">{t('scheduleUnavailable')}</p>;
  return <section className="space-y-4" aria-label={t('schedulePreferences')}>
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
    {value.map((pref,i)=>{
      const times=getSelectableTimes(schedule,pref.date_from,pref.date_to);
      const selected=pref.time_from+'-'+pref.time_to;
      return <div key={i} className="space-y-4 rounded-xl border border-border p-3">
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
            <Input id={'preference-date-'+i} type="date" required min={today} max={maxDate} value={pref.date_from} onChange={e=>updateDate(i,'date_from',e.target.value)}/></div>
          {range[i]&&<div className="space-y-1"><Label htmlFor={'preference-date-to-'+i}>{t('scheduleDateTo')}</Label>
            <Input id={'preference-date-to-'+i} type="date" required min={pref.date_from||today} max={maxDate} value={pref.date_to} onChange={e=>updateDate(i,'date_to',e.target.value)}/></div>}
        </div>
        {pref.date_from&&pref.date_to&&<div className="space-y-3">
          <Label>{t('scheduleSelectTime')}</Label>
          {times.length>0?<div role="group" aria-label={t('scheduleSelectTime')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {times.map(option=>{
              const active=selected===option.from+'-'+option.to;
              return <button type="button" key={option.from+'-'+option.to} aria-pressed={active}
                onClick={()=>onChange(value.map((p,index)=>index===i?{...p,time_from:option.from,time_to:option.to}:p))}
                className={`min-h-11 rounded-lg border px-2 py-2 text-sm transition-colors ${active?'border-primary bg-primary text-primary-foreground':'border-border bg-card hover:bg-muted'}`}>
                {option.from}–{option.to}
              </button>;
            })}
          </div>:<p role="status" className="text-sm text-muted-foreground">{t('scheduleNoTimes')}</p>}
        </div>}
      </div>;
    })}
    {value.length<3&&<Button type="button" variant="outline" className="w-full" onClick={add}><Plus size={16}/>{t('scheduleAddPreference')}</Button>}
    <p className="text-xs text-muted-foreground">{t('scheduleRequestDisclaimer')}</p>
  </section>;
}
