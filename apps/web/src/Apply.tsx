import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { avatarUrl, getArtist, submitRequest, uploadReference, type Artist, type Contacts, type RequestKind, type User, type AvailabilityPreference } from './api';
import { SchedulePreferences } from './SchedulePreferences';
import ContactsFields from './Contacts';
import { useI18n } from './i18n';

const limits={maxFiles:3,maxBytes:5*1024*1024};
const bodyAreas:Record<'en'|'ru'|'sr',Record<string,string>>={
  en:{forearm:'Forearm',upper_arm:'Upper arm',shoulder:'Shoulder',chest:'Chest',back:'Back',neck:'Neck',ribs:'Ribs',wrist:'Wrist',thigh:'Thigh',calf:'Calf',ankle:'Ankle',other:'Other'},
  ru:{forearm:'Предплечье',upper_arm:'Плечо',shoulder:'Надплечье',chest:'Грудь',back:'Спина',neck:'Шея',ribs:'Рёбра',wrist:'Запястье',thigh:'Бедро',calf:'Голень',ankle:'Лодыжка',other:'Другое'},
  sr:{forearm:'Podlaktica',upper_arm:'Nadlaktica',shoulder:'Rame',chest:'Grudi',back:'Leđa',neck:'Vrat',ribs:'Rebra',wrist:'Zglob',thigh:'Butina',calf:'List',ankle:'Gležanj',other:'Drugo'}
};
const styles=['Blackwork','Realism','Minimalism','Graphic','Traditional','Fineline','Other'];

export function ArtistPublic({slug,navigate}:{slug:string;navigate:(path:string)=>void}){
  const {t}=useI18n();
  const [artist,setArtist]=useState<Artist|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{let active=true;getArtist(slug).then(v=>{if(active)setArtist(v);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[slug]);
  if(error)return <p role="alert" className="py-12 text-center text-destructive">{t('artistUnavailable')}</p>;
  if(!artist)return <p className="py-12 text-center">{t('loading')}</p>;
  return <Card className="mx-auto max-w-xl"><CardHeader>
    <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('artist')}</p>
    <div className="flex items-center gap-4">{artist.avatar_present&&<img src={avatarUrl(artist.slug)} alt={artist.display_name} className="h-20 w-20 shrink-0 rounded-full object-cover" />}<div className="min-w-0"><CardTitle className="break-words text-2xl sm:text-3xl">{artist.display_name}</CardTitle><CardDescription>{artist.city}</CardDescription></div></div>
  </CardHeader><CardContent className="space-y-5">
    <p className="whitespace-pre-wrap leading-relaxed">{artist.bio}</p>
    <div className="flex flex-wrap gap-3">{Object.entries(artist.contact_channels).map(([name,value])=>{const href=name==='instagram'?'https://www.instagram.com/'+value.replace(/^@/,''):name==='telegram'?'https://t.me/'+value.replace(/^@/,''):name==='tiktok'||name==='website'?value:null;return href?<a key={name} href={href} target="_blank" rel="noopener noreferrer" className="max-w-full break-all rounded-full bg-secondary px-3 py-2 text-sm underline">{name}</a>:<span key={name} className="max-w-full break-all rounded-full bg-secondary px-3 py-2 text-sm">{name}: {value}</span>})}</div>
    {artist.accepting_requests?<Button className="w-full" onClick={()=>navigate('/a/'+slug+'/apply')}>{t('createRequest')} <ArrowRight size={16}/></Button>
      :<p className="text-muted-foreground">{t('artistUnavailable')}</p>}
  </CardContent></Card>;
}

export interface PostRequestSignup {requestId:string;claimToken:string;name:string;email:string;contacts:Contacts}
type Values={kind:RequestKind;name:string;description:string;style:string;placement:string;width:string;height:string;budget:string;email:string;contacts:Contacts;consent:boolean;website:string};
function initial(user:User|null):Values{return {kind:'consultation',name:user?.display_name??'',description:'',style:'',placement:'',width:'',height:'',budget:'',email:'',contacts:user?.contact_channels??{},consent:false,website:''};}
export function ApplyForm({slug,user,navigate,onFollowUp}:{slug:string;user:User|null;navigate:(path:string)=>void;onFollowUp:(draft:PostRequestSignup,kind:'login'|'register')=>void}){
  const {t,language}=useI18n();
  const [artist,setArtist]=useState<Artist|null>(null);
  const [artistError,setArtistError]=useState(false);
  const [values,setValues]=useState<Values>(()=>initial(user));
  const [step,setStep]=useState(0);
  const [useSaved,setUseSaved]=useState(Boolean(user));
  const [photos,setPhotos]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [submitted,setSubmitted]=useState('');
  const [signupDraft,setSignupDraft]=useState<PostRequestSignup|null>(null);
  const [preferences,setPreferences]=useState<AvailabilityPreference[]>([]);
  const [uploadWarning,setUploadWarning]=useState('');
  const [showMap,setShowMap]=useState(false);
  useEffect(()=>{let active=true;getArtist(slug).then(x=>{if(active)setArtist(x);}).catch(()=>{if(active)setArtistError(true);});return()=>{active=false;};},[slug]);
  useEffect(()=>{if(user)setValues(v=>({...v,name:v.name||user.display_name,contacts:Object.keys(v.contacts).length?v.contacts:user.contact_channels}));},[user]);
  function set<K extends keyof Values>(key:K,value:Values[K]){setValues(v=>({...v,[key]:value}));setError('');}
  function changeFiles(e:ChangeEvent<HTMLInputElement>){
    const next=Array.from(e.target.files??[]);
    if(next.length>limits.maxFiles||next.some(x=>!['image/jpeg','image/png','image/webp'].includes(x.type)||x.size===0||x.size>limits.maxBytes)){
      setError(t('chooseFiles'));e.target.value='';return;
    }
    setPhotos(next);setError('');
  }
  function next(){if(values.description.trim().length<10){setError(t('descriptionShort'));return;}
    if(Boolean(values.width)!==Boolean(values.height)){setError(t('wrongDimensions'));return;}
    if(values.width&&(Number(values.width)<0.5||Number(values.width)>100||Number(values.height)<0.5||Number(values.height)>100)){setError(t('wrongDimensions'));return;}
    setError('');setStep(1);
  }
  async function submit(e:FormEvent){
    e.preventDefault();if(busy)return;
    if(values.name.trim().length<2){setError(t('nameRequired'));return;}
    const contacts=useSaved&&user?user.contact_channels:values.contacts;
    const email=useSaved&&user&&Object.keys(contacts).length===0?user.email:values.email.trim();
    if(Object.values(contacts).every(x=>!x?.trim())&&!email){setError(t('contactRequired'));return;}
    if(!values.consent){setError(t('consent'));return;}
    if(values.kind==='session'&&preferences.some(p=>!p.date_from||!p.date_to||!p.time_from||!p.time_to||p.date_from>p.date_to||p.time_from>=p.time_to)){
      setError(t('scheduleChooseAtLeastOne'));return;
    }
    setBusy(true);setError('');setUploadWarning('');
    try{
      const result=await submitRequest(slug,{
        kind:values.kind,client_name:values.name.trim(),contact_email:email,contact_channels:contacts,
        description:values.description.trim(),
        answers:{style:values.style||null,placement:values.placement||null,
          ...(values.width&&values.height?{width_cm:Number(values.width),height_cm:Number(values.height)}:{}),
          budget:values.budget?Number(values.budget):null},
        preferred_at:null,availability_preferences:values.kind==='session'?preferences:[],
        consent_to_contact:values.consent,website:values.website,
      });
      setSubmitted(result.id);
      if(!user && result.claim_token){
        setSignupDraft({requestId:result.id,claimToken:result.claim_token,name:values.name.trim(),email,contacts});
      }
      let failures=0;
      for(const photo of photos){try{await uploadReference(result.id,result.upload_token,photo);}catch{failures+=1;}}
      if(failures)setUploadWarning(t('uploadPartial'));
    }catch(cause){const code=cause instanceof Error?cause.message:'unknownError';setError(code==='invalid_preferences'?t('scheduleChooseAtLeastOne'):t((['invalid_request','invalid_dimensions','contact_required','service_unavailable'].includes(code)?code:'unknownError') as 'invalid_request'));}
    finally{setBusy(false);}
  }
  if(artistError)return <p role="alert" className="py-10 text-center text-destructive">{t('artistUnavailable')}</p>;
  if(!artist)return <p className="py-10 text-center">{t('loading')}</p>;
  return <div className="mx-auto max-w-2xl">
    <Button variant="ghost" className="mb-4" onClick={()=>navigate('/a/'+slug)}><ArrowLeft size={16}/>{t('back')}</Button>
    <div className="mb-6"><p className="text-sm text-muted-foreground">{t('bookWith')}</p><h1 className="text-2xl font-semibold">{artist.display_name}</h1></div>
    {submitted?<Card><CardContent className="flex flex-col items-center gap-4 py-10 text-center">
      <CheckCircle2 size={48} className="text-green-700"/><h2 className="text-2xl font-semibold">{t('successTitle')}</h2>
      <p>{t('successText')}</p>{uploadWarning&&<p role="alert" className="text-destructive">{uploadWarning}</p>}
      <p className="break-all text-xs text-muted-foreground">{t('number')}: {submitted}</p>
      {signupDraft&&<div className="w-full space-y-3 rounded-xl border border-border bg-muted/50 p-4">
        <h3 className="font-semibold">{t('afterSubmitSignUpTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('afterSubmitSignUpDescription')}</p>
        {!signupDraft.email&&<p className="text-xs text-muted-foreground">{t('afterSubmitEmailRequired')}</p>}
        <Button type="button" className="w-full" onClick={()=>onFollowUp(signupDraft,'register')}>{t('afterSubmitSignUpButton')}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={()=>onFollowUp(signupDraft,'login')}>{t('afterSubmitSignIn')}</Button>
      </div>}
      {user?.role==='client'&&<Button onClick={()=>navigate('/client/dashboard')}>{t('myRequests')}</Button>}
      <Button variant="outline" onClick={()=>{setValues(initial(user));setSubmitted('');setSignupDraft(null);setPreferences([]);setStep(0);setPhotos([]);}}>{t('newRequest')}</Button>
    </CardContent></Card>:
    <Card><CardHeader>
      <CardTitle>{t('formTitle')}</CardTitle><CardDescription>{t('step')} {step+1}/2</CardDescription>
      <div aria-hidden className="grid grid-cols-2 gap-2 pt-2"><div className="h-1.5 rounded-full bg-primary"/><div className={'h-1.5 rounded-full '+(step===1?'bg-primary':'bg-secondary')}/></div>
    </CardHeader><CardContent>
      <form className="space-y-5" onSubmit={submit}>
        {step===0?<><div className="grid grid-cols-2 gap-2">
          <Button type="button" className="whitespace-normal" variant={values.kind==='consultation'?'default':'outline'} aria-pressed={values.kind==='consultation'} onClick={()=>set('kind','consultation')}>{t('consultation')}</Button>
          <Button type="button" className="whitespace-normal" variant={values.kind==='session'?'default':'outline'} aria-pressed={values.kind==='session'} onClick={()=>set('kind','session')}>{t('appointmentRequest')}</Button>
        </div>
        <div className="space-y-2"><Label htmlFor="idea">{t('idea')} *</Label><Textarea id="idea" rows={5} maxLength={5000} required placeholder={t('ideaHint')} value={values.description} onChange={e=>set('description',e.target.value)}/></div>
        <div className="space-y-2"><Label htmlFor="style">{t('style')}</Label><select id="style" className="h-10 w-full rounded-md border border-input bg-card px-3" value={values.style} onChange={e=>set('style',e.target.value)}><option value="">{t('chooseStyle')}</option>{styles.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
        <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor="placement">{t('placement')}</Label>
          <button type="button" aria-label={t('bodyGuide')} title={t('bodyGuide')} onClick={()=>setShowMap(true)} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><CircleHelp size={18}/></button></div>
          <select id="placement" className="h-10 w-full rounded-md border border-input bg-card px-3" value={values.placement} onChange={e=>set('placement',e.target.value)}>
            <option value="">{t('placementHint')}</option>{Object.entries(bodyAreas[language]).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-3">{(['width','height'] as const).map(key=><div className="space-y-2" key={key}><Label htmlFor={key}>{t(key)}</Label><Input id={key} type="number" min="0.5" max="100" step="0.5" value={values[key]} onChange={e=>set(key,e.target.value)}/></div>)}</div>
        <div className="space-y-2"><Label htmlFor="budget">{t('budget')}</Label><Input id="budget" type="number" min="0" max="100000" value={values.budget} onChange={e=>set('budget',e.target.value)}/></div>
        <div className="space-y-2"><Label htmlFor="photos">{t('referencePhotos')}</Label><Input id="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={changeFiles}/>
          <p className="text-xs text-muted-foreground">{t('photoHint')}</p>{photos.length>0&&<p className="text-xs">{photos.map(x=>x.name).join(', ')}</p>}</div>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" className="w-full" onClick={next}>{t('continue')} <ArrowRight size={16}/></Button>
        </>:<>
          {values.kind==='session'&&<SchedulePreferences slug={slug} value={preferences} onChange={setPreferences}/>} 
          <div className="space-y-2"><Label htmlFor="client-name">{t('name')}</Label><Input id="client-name" value={values.name} onChange={e=>set('name',e.target.value)} required/></div>
          {user&&<div className="space-y-3 rounded-lg bg-muted p-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useSaved} onChange={e=>setUseSaved(e.target.checked)}/>{t('accountContacts')}</label>
            {useSaved&&<p className="text-xs text-muted-foreground">{Object.entries(user.contact_channels).map(([k,v])=>k+': '+v).join(' • ')||user.email}</p>}
          </div>}
          {(!user||!useSaved)&&<><p className="text-sm font-medium">{t('contactTitle')}</p><p className="text-xs text-muted-foreground">{t('contactsHint')}</p>
            <div className="space-y-2"><Label htmlFor="contact-email">{t('contactEmail')}</Label><Input id="contact-email" type="email" value={values.email} onChange={e=>set('email',e.target.value)} placeholder={t('optional')}/></div>
            <ContactsFields includeEmail={false} value={values.contacts} onChange={x=>set('contacts',x)}/></>}
          <div className="sr-only"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={e=>set('website',e.target.value)}/></div>
          <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4" type="checkbox" checked={values.consent} onChange={e=>set('consent',e.target.checked)}/><span>{t('consent')}</span></label>
          {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={()=>{setStep(0);setError('');}}><ArrowLeft size={16}/>{t('back')}</Button><Button type="submit" disabled={busy}><Send size={16}/>{busy?t('sending'):t('submit')}</Button></div>
        </>}
      </form>
    </CardContent></Card>}
    {showMap&&<div role="dialog" aria-modal="true" aria-label={t('bodyGuide')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3" onClick={()=>setShowMap(false)}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-card p-5" onClick={e=>e.stopPropagation()}>
        <div className="mb-3 flex justify-between gap-3"><h2 className="font-semibold">{t('bodyGuide')}</h2><Button variant="outline" size="sm" onClick={()=>setShowMap(false)}>✕</Button></div>
        <p className="mb-3 text-sm text-muted-foreground">{t('bodyGuideDescription')}</p>
        <img className="mx-auto max-h-[65vh] w-full object-contain" src="/body-map.svg" alt={t('bodyGuideDescription')}/>
      </div>
    </div>}
  </div>;
}
