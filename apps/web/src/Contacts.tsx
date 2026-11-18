import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Contacts } from './api';
import { useI18n } from './i18n';

const fields: Array<keyof Contacts>=['email','telegram','whatsapp','viber','instagram'];
export default function ContactsFields({value,onChange,includeEmail=true}:{value:Contacts;onChange:(v:Contacts)=>void;includeEmail?:boolean}) {
  const {t}=useI18n();
  return <div className="grid gap-4 sm:grid-cols-2">
    {fields.filter(x=>includeEmail||x!=='email').map(name=><div className="space-y-2" key={name}>
      <Label htmlFor={'contact-'+name}>{name==='email'?t('contactEmail'):t(name)}</Label>
      <Input id={'contact-'+name} type={name==='email'?'email':'text'} maxLength={140}
        placeholder={name==='telegram'?t('telegramHint'):name==='whatsapp'?t('whatsappHint'):name==='viber'?t('viberHint'):name==='instagram'?t('instagramHint'):t('optional')}
        value={value[name]??''}
        onChange={e=>{const next={...value};if(e.target.value.trim())next[name]=e.target.value;else delete next[name];onChange(next);}}/>
    </div>)}
  </div>;
}
