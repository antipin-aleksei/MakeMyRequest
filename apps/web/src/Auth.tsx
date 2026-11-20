import { useState, type FormEvent } from 'react';
import { ArrowLeft, Apple, Chrome, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, register, type Role, type User } from './api';
import { useI18n } from './i18n';

export function AuthPage({kind,role,onSuccess,navigate,prefill}:{kind:'login'|'register';role:Role;onSuccess:(u:User)=>void;navigate:(path:string)=>void;prefill?:{name:string;email:string}}){
  const {t,language}=useI18n();
  const [displayName,setDisplayName]=useState(prefill?.name??'');
  const [email,setEmail]=useState(prefill?.email??'');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');
    try{
      const reply=kind==='login'?await login(email,password,role):await register(displayName,email,password,role,language);
      onSuccess(reply.user);
    }catch(cause){const code=cause instanceof Error?cause.message:'unknownError';setError(
      code==='email_in_use'?t('email_in_use'):code==='invalid_credentials'?t('invalid_credentials'):
      code==='invalid_registration'?t('invalidRegistration'):code==='role_mismatch'?t('roleMismatch'):t('unknownError')
    );}finally{setBusy(false);}
  }
  return <div className="mx-auto w-full max-w-md">
    <Button size="sm" variant="ghost" className="mb-5" onClick={()=>navigate('/')}><ArrowLeft size={16}/>{t('back')}</Button>
    <Card>
      <CardHeader><CardTitle>{kind==='login'?t('loginTitle'):t('registerTitle')}</CardTitle>
      <CardDescription>{kind==='register'?(role==='artist'?t('artist'):t('client')):t('homeSubtitle')}</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4" onSubmit={submit}>
          {kind==='register'&&<div className="space-y-2"><Label htmlFor="auth-name">{t('name')}</Label>
            <Input id="auth-name" autoComplete="name" required minLength={2} maxLength={120} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></div>}
          <div className="space-y-2"><Label htmlFor="auth-email">{t('email')}</Label>
            <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div className="space-y-2"><Label htmlFor="auth-password">{t('password')}</Label>
            <Input id="auth-password" type="password" autoComplete={kind==='login'?'current-password':'new-password'} required minLength={kind==='register'?10:1} value={password} onChange={e=>setPassword(e.target.value)}/>
            {kind==='register'&&<p className="text-xs text-muted-foreground">{t('minimumPassword')}</p>}</div>
          {error&&<p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy}>{busy?t('loading'):(kind==='login'?t('signIn'):t('signUp'))}</Button>
        </form>
        <Button variant="ghost" className="w-full" onClick={()=>navigate(kind==='login'?'/auth/register/'+role:'/auth/login/'+role)}>{kind==='login'?t('noAccount'):t('alreadyHaveAccount')} {kind==='login'?t('signUp'):t('signIn')}</Button>
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium">{t('oauthTitle')}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button disabled variant="outline" size="sm" title={t('oauthNote')}><Chrome size={15}/>{t('google')}</Button>
            <Button disabled variant="outline" size="sm" title={t('oauthNote')}><Apple size={15}/>{t('apple')}</Button>
            <Button disabled variant="outline" size="sm" title={t('oauthNote')}><Facebook size={15}/>{t('facebook')}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('oauthUnavailable')}</p>
        </div>
      </CardContent>
    </Card>
  </div>;
}
