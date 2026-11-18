import { useEffect, useState } from 'react';
import { ArrowRight, HeartHandshake, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthPage } from './Auth';
import { ApplyForm, ArtistPublic, type PostRequestSignup } from './Apply';
import { ArtistDashboard, ClientDashboard } from './Dashboard';
import { claimGuestRequest, getMe, hasSession, logout, updateMe, type Role, type User } from './api';
import { LanguageProvider, LanguageSwitch, useI18n } from './i18n';

function getPath():string{return (window.location.hash.slice(1)||'/').split('?')[0];}
function navigate(path:string){window.location.hash=path;window.scrollTo(0,0);}
function Home({user}:{user:User|null}){
  const {t}=useI18n();
  return <div className="mx-auto max-w-3xl space-y-7 py-10 sm:py-20">
    <div className="space-y-4 text-center"><h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t('homeTitle')}</h1><p className="mx-auto max-w-xl text-muted-foreground">{t('homeSubtitle')}</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('artist')}</CardTitle><CardDescription>{t('artistSetupHint')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={()=>navigate(user?.role==='artist'?'/artist/dashboard':'/auth/register/artist')}>{user?.role==='artist'?t('dashboard'):t('signUp')} <ArrowRight size={15}/></Button>
          {!user&&<Button variant="outline" onClick={()=>navigate('/auth/login/artist')}>{t('signIn')}</Button>}
        </CardContent></Card>
      <Card><CardHeader><CardTitle>{t('client')}</CardTitle><CardDescription>{t('signInToTrack')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={()=>navigate(user?.role==='client'?'/client/dashboard':'/auth/register/client')}>{user?.role==='client'?t('myRequests'):t('signUp')} <ArrowRight size={15}/></Button>
          {!user&&<Button variant="outline" onClick={()=>navigate('/auth/login/client')}>{t('signIn')}</Button>}
        </CardContent></Card>
    </div>
  </div>;
}
function Shell(){
  const {t,setLanguage}=useI18n();
  const [route,setRoute]=useState(getPath);
  const [user,setUser]=useState<User|null>(null);
  const [pendingFollowUp,setPendingFollowUp]=useState<PostRequestSignup|null>(null);
  const [claimNotice,setClaimNotice]=useState('');
  const [claimFailed,setClaimFailed]=useState(false);
  const [loading,setLoading]=useState(hasSession());
  useEffect(()=>{const handler=()=>setRoute(getPath());window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(()=>{if(user && !localStorage.getItem('mmr_lang'))setLanguage(user.preferred_language);},[user,setLanguage]);
  useEffect(()=>{if(!hasSession())return;getMe().then(setUser).catch(()=>{sessionStorage.removeItem('mmr_session');window.location.reload();}).finally(()=>setLoading(false));},[]);
  async function leave(){await logout();setUser(null);navigate('/');}
  async function finishClaim(user:User,draft:PostRequestSignup){
    let current=user;
    if(Object.keys(draft.contacts).length){
      current=await updateMe(current.display_name,current.preferred_language,{...draft.contacts,...current.contact_channels});
      setUser(current);
    }
    await claimGuestRequest(draft.requestId,draft.claimToken);
    setPendingFollowUp(null);setClaimFailed(false);setClaimNotice(t('claimSuccess'));
  }
  function signedIn(value:User){
    setUser(value);
    if(pendingFollowUp&&value.role==='client'){
      void finishClaim(value,pendingFollowUp).catch(()=>{setClaimFailed(true);setClaimNotice(t('claimError'));});
    }
    navigate(value.role==='artist'?'/artist/dashboard':'/client/dashboard');
  }
  function followUp(draft:PostRequestSignup,kind:'login'|'register'){
    setPendingFollowUp(draft);setClaimNotice('');setClaimFailed(false);
    navigate('/auth/'+kind+'/client');
  }
  const bits=route.split('/').filter(Boolean);
  const artistSlug=bits[0]==='a'?bits[1]:undefined;
  const auth=bits[0]==='auth';
  const role:Role=bits[2]==='artist'?'artist':'client';
  let content;
  if(artistSlug&&bits.length===2)content=<ArtistPublic key={artistSlug} slug={artistSlug} navigate={navigate}/>;
  else if(artistSlug&&bits[2]==='apply')content=<ApplyForm key={artistSlug} slug={artistSlug} user={user} navigate={navigate} onFollowUp={followUp}/>;
  else if(route==='/artist/dashboard'||route==='/admin')content=user?.role==='artist'?<ArtistDashboard user={user} navigate={navigate}/>:<AuthPage kind="login" role="artist" onSuccess={signedIn} navigate={navigate}/>;
  else if(route==='/client/dashboard')content=user?.role==='client'?<ClientDashboard user={user} onUserChanged={setUser}/>:<AuthPage kind="login" role="client" onSuccess={signedIn} navigate={navigate}/>;
  else if(auth)content=<AuthPage kind={bits[1]==='register'?'register':'login'} role={role} onSuccess={signedIn} navigate={navigate} prefill={role==='client'&&pendingFollowUp?pendingFollowUp:undefined}/>;
  else content=<Home user={user}/>;
  return <div className="min-h-svh bg-background text-foreground">
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <a href="/#/" className="flex items-center gap-2 font-semibold"><span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><HeartHandshake size={18}/></span><span className="hidden sm:inline">{t('brand')}</span><span className="sm:hidden">MMR</span></a>
      <div className="flex items-center gap-2"><LanguageSwitch/>{user&&<Button size="sm" variant="outline" onClick={()=>navigate(user.role==='artist'?'/artist/dashboard':'/client/dashboard')}>{t('dashboard')}</Button>}
        {user&&<Button size="sm" variant="ghost" onClick={()=>void leave()}><LogOut size={15}/><span className="hidden sm:inline">{t('signOut')}</span></Button>}
      </div>
    </div></header>
    <main className="mx-auto w-full max-w-5xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8">
      {claimNotice&&<div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
        <span>{claimNotice}</span>
        {claimFailed&&pendingFollowUp&&user?.role==='client'&&<Button variant="outline" size="sm" onClick={()=>void finishClaim(user,pendingFollowUp).catch(()=>setClaimNotice(t('claimError')))}>{t('continue')}</Button>}
      </div>}
      {loading?<p className="py-12 text-center">{t('loading')}</p>:content}
    </main>
    <footer className="mx-auto max-w-5xl border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">{t('privacy')}</footer>
  </div>;
}
export default function App(){return <LanguageProvider><Shell/></LanguageProvider>;}
