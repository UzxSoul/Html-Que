import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { emptyData, validateBatch, normalize, type LearningData, type Question, type Attempt } from './model';
import { toast } from 'sonner';
import bundled from './bundled.json';
const LOCAL_KEY='html-master-pro-demo-v1';
type Store = { data:LearningData; loading:boolean; user:User|null; storage:'local'|'cloud'; error:string; addQuestions:(questions:Question[])=>Promise<void>; updateQuestion:(q:Question)=>Promise<void>; deleteQuestion:(id:string)=>Promise<void>; saveAttempt:(a:Attempt)=>Promise<void>; deleteAttempt:(id:string)=>Promise<void>; bookmark:(id:string)=>Promise<void>; reset:()=>Promise<void> };
const Context=createContext<Store|null>(null);
const toRow=(q:Question,userId:string)=>({id:q.id,owner_id:userId,question:q.question,options:q.options,correct_answer:q.correctAnswer,explanation:q.explanation,topic:q.topic,difficulty:q.difficulty,source_name:q.sourceName,source_url:q.sourceUrl,verification:q.verification,normalized:normalize(q.question),created_at:q.createdAt});
export function LearningProvider({children}:{children:ReactNode}) {
 const [data,setData]=useState<LearningData>(emptyData),[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const current=useRef(data);current.current=data;
 useEffect(()=>{
  let alive=true;
  async function load(u:User|null){setLoading(true);setError('');setUser(u);try{
   if(u){const [q,a,b]=await Promise.all([supabase.from('html_questions').select('*').order('created_at').range(0,1999),supabase.from('html_attempts').select('*').order('created_at',{ascending:false}),supabase.from('html_bookmarks').select('*')]);if(q.error||a.error||b.error)throw q.error||a.error||b.error;
    if(alive)setData({questions:(q.data||[]).map(r=>({id:r.id,question:r.question,options:r.options as string[],correctAnswer:r.correct_answer,explanation:r.explanation,topic:r.topic,difficulty:r.difficulty as Question['difficulty'],sourceName:r.source_name,sourceUrl:r.source_url,verification:r.verification,createdAt:r.created_at})),attempts:(a.data||[]).map(r=>r.payload as unknown as Attempt),bookmarks:(b.data||[]).map(r=>r.question_id)});
   }else {let next=emptyData;const text=localStorage.getItem(LOCAL_KEY);if(text){const parsed=JSON.parse(text) as LearningData;if(!Array.isArray(parsed.questions)||!Array.isArray(parsed.attempts)||!Array.isArray(parsed.bookmarks))throw new Error('Saved demo data is malformed. Export a backup before resetting.');const validated=validateBatch(parsed.questions,[]);if(validated.rejected.length||validated.duplicates.length)throw new Error('Saved demo bank failed validation.');next=parsed;}const SEED_KEY='html-master-pro-bundled-v1';if(!localStorage.getItem(SEED_KEY)){const extra=validateBatch(bundled,next.questions).accepted;if(extra.length){next={...next,questions:[...next.questions,...extra]};}try{localStorage.setItem(LOCAL_KEY,JSON.stringify(next));localStorage.setItem(SEED_KEY,'done');}catch{/* storage full: questions still show this session */}}if(alive)setData(next);}
  }catch(e){if(alive){setError(e instanceof Error?e.message:'Could not load saved data');setData(emptyData);}}finally{if(alive)setLoading(false);}}
  void supabase.auth.getSession().then(({data})=>load(data.session?.user??null));
  const {data:listener}=supabase.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))void load(session?.user??null);});
  return()=>{alive=false;listener.subscription.unsubscribe();};
 },[]);
 function commit(next:LearningData){if(!user){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(next));}catch{throw new Error('Unable to save: browser storage is full or unavailable. Export a backup.');}}current.current=next;setData(next);}
 async function addQuestions(questions:Question[]){if(error)throw new Error(error);const result=validateBatch(questions,current.current.questions);if(result.rejected.length||result.duplicates.length)throw new Error('Bank changed: re-preview the import before saving.');if(user){const {error}=await supabase.from('html_questions').insert(questions.map(q=>toRow(q,user.id)));if(error)throw new Error(error.message);}commit({...current.current,questions:[...current.current.questions,...questions]});}
 async function updateQuestion(q:Question){const result=validateBatch([q],current.current.questions.filter(s=>s.id!==q.id));if(!result.accepted.length)throw new Error(result.rejected[0]?.reason||'Duplicate question');if(user){const {error}=await supabase.from('html_questions').update(toRow(q,user.id)).eq('id',q.id);if(error)throw new Error(error.message);}commit({...current.current,questions:current.current.questions.map(s=>s.id===q.id?q:s)});}
 async function deleteQuestion(id:string){if(user){const {error}=await supabase.from('html_questions').delete().eq('id',id);if(error)throw new Error(error.message);}commit({...current.current,questions:current.current.questions.filter(q=>q.id!==id),bookmarks:current.current.bookmarks.filter(b=>b!==id)});}
 async function saveAttempt(a:Attempt){if(current.current.attempts.some(s=>s.id===a.id))return;if(user){const {error}=await supabase.from('html_attempts').insert({id:a.id,owner_id:user.id,payload:JSON.parse(JSON.stringify(a))});if(error)throw new Error(error.message);}commit({...current.current,attempts:[a,...current.current.attempts]});}
 async function deleteAttempt(id:string){if(user){const {error}=await supabase.from('html_attempts').delete().eq('id',id);if(error)throw new Error(error.message);}commit({...current.current,attempts:current.current.attempts.filter(a=>a.id!==id)});}
 async function bookmark(id:string){const exists=current.current.bookmarks.includes(id);if(user){const result=exists?await supabase.from('html_bookmarks').delete().eq('question_id',id):await supabase.from('html_bookmarks').insert({owner_id:user.id,question_id:id});if(result.error){toast.error(result.error.message);return;}}try{commit({...current.current,bookmarks:exists?current.current.bookmarks.filter(b=>b!==id):[...current.current.bookmarks,id]});}catch(e){toast.error(String(e));}}
 async function reset(){if(user){for(const table of ['html_bookmarks','html_attempts','html_questions'] as const){const {error}=await supabase.from(table).delete().eq('owner_id',user.id);if(error)throw new Error(error.message);}}commit(emptyData);}
 return <Context.Provider value={{data,user,loading,error,storage:user?'cloud':'local',addQuestions,updateQuestion,deleteQuestion,saveAttempt,deleteAttempt,bookmark,reset}}>{children}</Context.Provider>;
}
export function useLearning(){const value=useContext(Context);if(!value)throw new Error('LearningProvider required');return value;}
