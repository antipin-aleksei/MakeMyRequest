import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ContactsFields from './Contacts';
import { useI18n } from './i18n';
import {
  getMyArtist, getArtistRequest, importLegacy, listArtistRequests, listClientRequests,
  loadReference, removeRequest, saveArtist, updateMe, updateStatus,
  type Artist, type Contacts, type Detail, type RequestStatus, type Summary, type User
} from './api';

function translateError(error:unknown,t:(key:any)=>string):string {
  const key=error instanceof Error?error.message:'unknownError';
  const allowed=['invalid_profile','slug_in_use','invalid_artist','invalid_credentials','email_in_use','invalid_request','contact_required','service_unavailable','unauthorized','forbidden','not_found','unknownError'];
  return t(allowed.includes(key)?key:'unknownError');
}
const statusValues:RequestStatus[]=['new','in_review','needs_info','accepted','declined'];
function Status({value}:{value:RequestStatus}) {
  const {t}=useI18n();return <span className="rounded-full bg-secondary px-3 py-1 text-xs">{t(('status_'+value) as 'status_new')}</span>;
}
function PrivateImage({id,alt}:{id:string;alt:string}){
  const [url,setUrl]=useState('');
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;let objectUrl='';
    loadReference(id).then(v=>{if(active){objectUrl=v;setUrl(v);}else URL.revokeObjectURL(v);}).catch(()=>{if(active)setError(true);});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[id]);
  if(error)return <span className="text-sm text-destructive">Image unavailable</span>;
  return url?<img src={url} alt={alt} className="max-h-80 w-full rounded-lg border border-border object-contain" />:<p className="text-sm text-muted-foreground">…</p>;
}
function ContactLinks({contacts,email}:{contacts:Contacts;email:string}){
  const {t}=useI18n();
  const all={...contacts,...(email?{email}: {})};
  const linkFor=(name:string,value:string)=>{
    const clean=value.trim();
    if(name==='email'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))return 'mailto:'+encodeURIComponent(clean);
    if(name==='telegram'&&/^@?[a-zA-Z0-9_]{5,32}$/.test(clean))return 'https://t.me/'+encodeURIComponent(clean.replace(/^@/,''));
    if(name==='instagram'&&/^@?[a-zA-Z0-9_.]{1,30}$/.test(clean))return 'https://www.instagram.com/'+encodeURIComponent(clean.replace(/^@/,''));
    if((name==='whatsapp'||name==='viber')&&/^\+?[0-9 ()-]{6,24}$/.test(clean)){
      const digits=clean.replace(/\D/g,'');
      return name==='whatsapp'?'https://wa.me/'+digits:'viber://chat?number=%2B'+digits;
    }
    return null;
  };
  return <section className="space-y-2"><h3 className="font-semibold">{t('clientContacts')}</h3>
    <div className="flex flex-wrap gap-2">{Object.entries(all).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[1].trim()!=='').map(([name,value])=>{
      const href=linkFor(name,value);
      return href?<a href={href} target={name==='email'?'_self':'_blank'} rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" key={name}>{name}: {value} <ExternalLink size={13}/></a>
        :<span key={name} className="rounded-md border border-border px-3 py-2 text-sm">{name}: {value}</span>;
    })}</div>
  </section>;
}
function ArtistProfileEditor({user,current,onSave}:{user:User;current:Artist|null;onSave:(v:Artist)=>void}){
  const {t}=useI18n();
  const [slug,setSlug]=useState(current?.slug??'tattoo-'+user.id.slice(0,8));
  const [name,setName]=useState(current?.display_name??user.display_name);
  const [bio,setBio]=useState(current?.bio??'');
  const [city,setCity]=useState(current?.city??'');
  const [contacts,setContacts]=useState<Contacts>(current?.contact_channels??{});
  const [accepting,setAccepting]=useState(current?.accepting_requests??true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function save(event:FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setError('');
    try{onSave(await saveArtist({slug,display_name:name,bio,city,contact_channels:contacts,accepting_requests:accepting}));}
    catch(cause){setError(translateError(cause,t));}
    finally{setSaving(false);}
  }
  return <Card><CardHeader><CardTitle>{current?t('editProfile'):t('artistSetup')}</CardTitle><CardDescription>{t('artistSetupHint')}</CardDescription></CardHeader>
    <CardContent><form onSubmit={save} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="artist-name">{t('artistName')}</Label><Input id="artist-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required/></div>
      <div className="space-y-2"><Label htmlFor="artist-slug">{t('slug')}</Label><Input id="artist-slug" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} minLength={3} maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" required/><p className="text-xs text-muted-foreground">{t('slugHint')}</p></div>
      <div className="space-y-2"><Label htmlFor="artist-bio">{t('bio')}</Label><Textarea id="artist-bio" value={bio} onChange={e=>setBio(e.target.value)} rows={4} maxLength={3000}/></div>
      <div className="space-y-2"><Label htmlFor="artist-city">{t('city')}</Label><Input id="artist-city" value={city} onChange={e=>setCity(e.target.value)} maxLength={120}/></div>
      <div className="space-y-2"><h3 className="text-sm font-medium">{t('contactMethods')}</h3><ContactsFields value={contacts} onChange={setContacts}/></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={accepting} onChange={e=>setAccepting(e.target.checked)}/>{t('accepting')}</label>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>{saving?t('loading'):t('save')}</Button>
    </form></CardContent>
  </Card>;
}
export function ArtistDashboard({user,navigate}:{user:User;navigate:(path:string)=>void}){
  const {t}=useI18n();
  const [profile,setProfile]=useState<Artist|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [editing,setEditing]=useState(false);
  const [items,setItems]=useState<Summary[]>([]);
  const [filter,setFilter]=useState<RequestStatus|'all'>('all');
  const [selected,setSelected]=useState<Detail|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [oldKey,setOldKey]=useState('');
  const [importOpen,setImportOpen]=useState(false);
  useEffect(()=>{let active=true;
    Promise.all([getMyArtist(),listArtistRequests()]).then(([artist,records])=>{if(active){setProfile(artist);setItems(records);setLoaded(true);}})
      .catch(cause=>{if(active){setError(translateError(cause,t));setLoaded(true);}});
    return()=>{active=false;};
  },[t]);
  async function refresh(){
    try{setError('');setItems(await listArtistRequests());}catch(cause){setError(translateError(cause,t));}
  }
  async function open(id:string){setBusy(true);setError('');try{setSelected(await getArtistRequest(id));}catch(cause){setError(translateError(cause,t));}finally{setBusy(false);}}
  async function change(status:RequestStatus){if(!selected)return;setBusy(true);try{await updateStatus(selected.id,status);setSelected(await getArtistRequest(selected.id));await refresh();}catch(cause){setError(translateError(cause,t));}finally{setBusy(false);}}
  async function remove(){if(!selected||!window.confirm(t('deleteConfirm')))return;setBusy(true);try{await removeRequest(selected.id);setSelected(null);setNotice(t('requestDeleted'));await refresh();}catch(cause){setError(translateError(cause,t));}finally{setBusy(false);}}
  async function claim(){if(!oldKey.trim())return;setBusy(true);setError('');try{const result=await importLegacy(oldKey);setOldKey('');setImportOpen(false);setNotice(t('imported')+': '+result.migrated);await refresh();}catch(cause){setError(translateError(cause,t));}finally{setBusy(false);}}
  const link=(suffix='')=>window.location.origin+'/#/a/'+profile?.slug+suffix;
  const copy=(text:string)=>{void navigator.clipboard.writeText(text).then(()=>setNotice(t('copied'))).catch(()=>setNotice(text));};
  if(!loaded)return <p className="py-10 text-center">{t('loading')}</p>;
  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{t('requestsInbox')}</h1>{profile&&!editing&&<Button variant="outline" onClick={()=>setEditing(true)}>{t('editProfile')}</Button>}</div>
    {error&&<p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-secondary p-3 text-sm">{notice}</p>}
    {(!profile||editing)&&<ArtistProfileEditor key={profile?.id??'new'} user={user} current={profile} onSave={value=>{setProfile(value);setEditing(false);setNotice(t('profileUpdated'));}}/>}
    {profile&&<><Card><CardContent className="space-y-3 pt-6">
      <p className="font-medium">{t('publicPage')}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>copy(link())}>{t('copy')}: {t('publicPage')}</Button>
        <Button size="sm" variant="outline" onClick={()=>copy(link('/apply'))}>{t('copy')}: {t('bookingLink')}</Button>
        <Button size="sm" onClick={()=>navigate('/a/'+profile.slug)}>{t('view')} <ExternalLink size={15}/></Button></div>
      <p className="break-all text-xs text-muted-foreground">{link('/apply')}</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('requestsInbox')}</CardTitle><CardDescription>{items.length}</CardDescription></CardHeader><CardContent className="space-y-4">
      {selected?<div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={()=>setSelected(null)}><ArrowLeft size={16}/>{t('back')}</Button>
        <h2 className="text-xl font-semibold">{selected.client_name}</h2>
        <div className="flex items-center gap-3"><Status value={selected.status}/><span className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</span></div>
        <p className="whitespace-pre-wrap">{selected.description}</p>
        <section className="space-y-2"><h3 className="font-semibold">{t('details')}</h3>
          {Object.entries(selected.answers).map(([k,v])=><p className="text-sm" key={k}><strong>{k}: </strong>{v??'—'}</p>)}
          {selected.preferred_at&&<p className="text-sm">{t('preferredDate')}: {new Date(selected.preferred_at).toLocaleDateString()}</p>}
        </section>
        <ContactLinks contacts={selected.contact_channels} email={selected.contact_email}/>
        {selected.attachments.length>0&&<section className="space-y-3"><h3 className="font-semibold">{t('references')}</h3><div className="grid gap-4 sm:grid-cols-2">{selected.attachments.map(x=><PrivateImage key={x.id} id={x.id} alt={x.filename}/>)}</div></section>}
        <div className="space-y-2"><Label htmlFor="update-status">{t('status')}</Label>
          <select id="update-status" value={selected.status} disabled={busy} onChange={e=>void change(e.target.value as RequestStatus)} className="h-10 w-full rounded-md border border-border bg-card px-3">
            {statusValues.map(x=><option value={x} key={x}>{t(('status_'+x) as 'status_new')}</option>)}</select></div>
        <Button variant="destructive" type="button" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/>{t('deleteRequest')}</Button>
      </div>:<>
        <div className="flex flex-wrap items-center justify-between gap-3"><select aria-label={t('status')} value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} className="rounded-md border border-border bg-card px-3 py-2 text-sm"><option value="all">{t('status')}</option>{statusValues.map(x=><option key={x} value={x}>{t(('status_'+x) as 'status_new')}</option>)}</select>
          <Button variant="ghost" size="sm" onClick={()=>void refresh()}><RefreshCw size={15}/>{t('loading').replace('…','')}</Button></div>
        {items.filter(x=>filter==='all'||x.status===filter).map(item=><button type="button" key={item.id} onClick={()=>void open(item.id)} className="flex w-full flex-col gap-2 rounded-lg border border-border p-4 text-left hover:bg-muted">
          <span className="flex flex-wrap items-center justify-between gap-2"><strong>{item.client_name}</strong><Status value={item.status}/></span>
          <span className="line-clamp-2 text-sm text-muted-foreground">{item.description}</span>
        </button>)}
        {items.length===0&&<p className="text-sm text-muted-foreground">{t('emptyInbox')}</p>}
      </>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('legacyImport')}</CardTitle><CardDescription>{t('legacyImportHint')}</CardDescription></CardHeader><CardContent>
      {!importOpen?<Button variant="outline" onClick={()=>setImportOpen(true)}>{t('legacyImport')}</Button>
      :<div className="space-y-3"><Label htmlFor="legacy">{t('legacyKey')}</Label><Input id="legacy" type="password" autoComplete="off" value={oldKey} onChange={e=>setOldKey(e.target.value)}/>
        <Button type="button" onClick={()=>void claim()} disabled={busy||!oldKey}>{t('import')}</Button></div>}
    </CardContent></Card>
    </>}
  </div>;
}
export function ClientDashboard({user,onUserChanged}:{user:User;onUserChanged:(u:User)=>void}){
  const {t,language}=useI18n();
  const [items,setItems]=useState<Summary[]>([]);
  const [contacts,setContacts]=useState<Contacts>(user.contact_channels);
  const [displayName,setDisplayName]=useState(user.display_name);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;listClientRequests().then(x=>{if(active)setItems(x);}).catch(cause=>{if(active)setError(translateError(cause,t));});return()=>{active=false;};},[t]);
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{onUserChanged(await updateMe(displayName,language,contacts));setNotice(t('profileUpdated'));}catch(cause){setError(translateError(cause,t));}finally{setBusy(false);}}
  return <div className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-2xl font-semibold">{t('myRequests')}</h1>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="rounded-md bg-secondary p-3 text-sm">{notice}</p>}
    <Card><CardHeader><CardTitle>{t('myRequests')}</CardTitle></CardHeader><CardContent className="space-y-3">
      {items.length===0?<p className="text-sm text-muted-foreground">{t('emptyClient')}</p>:items.map(x=><div key={x.id} className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{x.artist_name}</strong><Status value={x.status}/></div>
        <p className="whitespace-pre-wrap text-sm">{x.description}</p>
        <p className="text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString()}</p>
        {x.artist_slug&&<a className="text-sm underline" href={'/#/a/'+x.artist_slug}>{t('publicPage')}</a>}
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('editAccount')}</CardTitle><CardDescription>{t('accountContacts')}</CardDescription></CardHeader><CardContent>
      <form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="profile-name">{t('name')}</Label><Input id="profile-name" value={displayName} minLength={2} onChange={e=>setDisplayName(e.target.value)}/></div>
        <div className="space-y-2"><Label htmlFor="profile-email">{t('email')}</Label><Input id="profile-email" value={user.email} readOnly disabled/></div>
        <ContactsFields value={contacts} onChange={setContacts}/>
        <Button disabled={busy} type="submit">{busy?t('loading'):t('save')}</Button>
      </form>
    </CardContent></Card>
  </div>;
}
