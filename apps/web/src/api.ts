export type Role = 'artist' | 'client';
export type RequestKind = 'consultation' | 'session';
export type RequestStatus = 'new' | 'in_review' | 'needs_info' | 'accepted' | 'declined';
export interface WorkWindow {weekday:number;start:string;end:string}
export interface WorkSchedule {timezone:string;slots:WorkWindow[]}
export interface AvailabilityPreference {date_from:string;date_to:string;time_from:string;time_to:string}
export type Contacts = Partial<Record<'email'|'telegram'|'whatsapp'|'viber'|'instagram'|'tiktok'|'website',string>>;
export interface User { id:string; email:string; display_name:string; role:Role; preferred_language:'en'|'ru'|'sr'; contact_channels:Contacts }
export interface AuthReply {token:string;user:User}
export interface Artist {id:string;slug:string;display_name:string;bio:string;city:string;contact_channels:Contacts;accepting_requests:boolean;avatar_present:boolean}
export interface Inquiry {
  kind:RequestKind;client_name:string;contact_email:string;contact_channels:Contacts;
  description:string; answers:Record<string,string|number|null>;preferred_at:string|null;
  consent_to_contact:boolean;website?:string;availability_preferences?:AvailabilityPreference[];
}
export interface CreatedRequest {id:string;status:'new';upload_token:string;claim_token:string|null}
export interface Attachment {id:string;filename:string;media_type:string;size_bytes:number}
export interface Summary {id:string;artist_name:string;artist_slug:string|null;kind:RequestKind;status:RequestStatus;client_name:string;description:string;created_at:string}
export interface Detail {id:string;kind:RequestKind;status:RequestStatus;client_name:string;contact_email:string;contact_channels:Contacts;description:string;answers:Record<string,string|number|null>;preferred_at:string|null;created_at:string;form_version:number;availability_preferences:AvailabilityPreference[];availability_timezone:string|null;attachments:Attachment[]}
const ROOT=import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
let key=sessionStorage.getItem('mmr_session')??'';
export const hasSession=()=>Boolean(key);
export function setSession(value:string){key=value;if(value)sessionStorage.setItem('mmr_session',value);else sessionStorage.removeItem('mmr_session');}
function headers(extra?:Record<string,string>):Record<string,string>{return {...(key?{Authorization:'Bearer '+key}:{}),...extra};}
async function parse<T>(pending:Promise<Response>|Response):Promise<T>{
  const response=await pending;
  if(!response.ok){
    const details=await response.json().catch(()=>({error:'unknownError'})) as {error?:string};
    throw new Error(details.error??'unknownError');
  }
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
const url=(path:string)=>ROOT+'/api/v1'+path;
export const getArtist=(slug:string)=>parse<Artist>(fetch(url('/artists/'+encodeURIComponent(slug))));
export const getPublicSchedule=(slug:string)=>parse<WorkSchedule>(fetch(url('/artists/'+encodeURIComponent(slug)+'/schedule')));
export const getMySchedule=()=>parse<WorkSchedule>(fetch(url('/artist/schedule'),{headers:headers()}));
export const saveMySchedule=(schedule:WorkSchedule)=>parse<WorkSchedule>(fetch(url('/artist/schedule'),{method:'PUT',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(schedule)}));
export const getMe=()=>parse<User>(fetch(url('/auth/me'),{headers:headers()}));
export const getMyArtist=()=>parse<Artist|null>(fetch(url('/artist/me'),{headers:headers()}));
export const listArtistRequests=()=>parse<Summary[]>(fetch(url('/artist/requests'),{headers:headers()}));
export const listClientRequests=()=>parse<Summary[]>(fetch(url('/client/requests'),{headers:headers()}));
export const getArtistRequest=(id:string)=>parse<Detail>(fetch(url('/artist/requests/'+id),{headers:headers()}));
export const getClientRequest=(id:string)=>parse<Detail>(fetch(url('/client/requests/'+id),{headers:headers()}));
export const claimGuestRequest=(id:string,claim_token:string)=>parse<void>(fetch(url('/client/requests/'+id+'/claim'),{
  method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({claim_token}),
}));
export async function login(email:string,password:string,expected_role:Role):Promise<AuthReply>{
  const result=await parse<AuthReply>(fetch(url('/auth/login'),{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({email,password,expected_role})}));
  setSession(result.token);return result;
}
export async function register(display_name:string,email:string,password:string,role:Role,preferred_language:string):Promise<AuthReply>{
  const result=await parse<AuthReply>(fetch(url('/auth/register'),{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({display_name,email,password,role,preferred_language})}));
  setSession(result.token);return result;
}
export async function logout(){try{await fetch(url('/auth/logout'),{method:'POST',headers:headers()});}finally{setSession('');}}
export function updateMe(display_name:string,preferred_language:string,contact_channels:Contacts){
  return parse<User>(fetch(url('/auth/me'),{method:'PUT',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({display_name,preferred_language,contact_channels})}));
}
export function saveArtist(data:Omit<Artist,'id'|'avatar_present'>){
  return parse<Artist>(fetch(url('/artist/me'),{method:'PUT',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(data)}));
}
export const avatarUrl=(slug:string)=>url('/artists/'+encodeURIComponent(slug)+'/avatar');
export function uploadArtistAvatar(file:File){
  const body=new FormData();body.append('file',file);
  return parse<Artist>(fetch(url('/artist/avatar'),{method:'POST',headers:headers(),body}));
}
export function submitRequest(slug:string,data:Inquiry){
  return parse<CreatedRequest>(fetch(url('/artists/'+encodeURIComponent(slug)+'/requests'),{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(data)}));
}
export function uploadReference(id:string,token:string,file:File){
  const payload=new FormData();payload.append('file',file);
  return parse<Attachment>(fetch(url('/requests/'+id+'/attachments'),{method:'POST',headers:{'x-upload-token':token},body:payload}));
}
export function updateStatus(id:string,status:RequestStatus){
  return parse<void>(fetch(url('/artist/requests/'+id),{method:'PATCH',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({status})}));
}
export function removeRequest(id:string){
  return parse<void>(fetch(url('/artist/requests/'+id),{method:'DELETE',headers:headers()}));
}
export async function loadReference(id:string){
  const response=await fetch(url('/attachments/'+id),{headers:headers()});
  if(!response.ok)throw new Error('service_unavailable');
  return URL.createObjectURL(await response.blob());
}
export function importLegacy(secret:string){
  return parse<{migrated:number}>(fetch(url('/artist/claim-legacy'),{method:'POST',headers:headers({'x-legacy-admin-key':secret})}));
}
export const oauthProviders=()=>parse<{available:string[]}>(fetch(url('/auth/providers')));
