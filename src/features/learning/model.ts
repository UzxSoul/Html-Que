export const difficulties = ['Easy', 'Medium', 'Advanced'] as const;
export type Difficulty = typeof difficulties[number];
export const TARGET = 500;
export interface Question { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; topic: string; difficulty: Difficulty; sourceName: string; sourceUrl: string; verification: string; createdAt: string }
export interface Attempt { id: string; createdAt: string; mode: 'Practice' | 'Exam'; difficulty: string; questions: Question[]; answers: Record<string, number>; correct: number; incorrect: number; unanswered: number; score: number; seconds: number }
export interface LearningData { questions: Question[]; attempts: Attempt[]; bookmarks: string[] }
export const emptyData: LearningData = { questions: [], attempts: [], bookmarks: [] };
export const normalize = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function similar(a: string,b: string) { if (a===b) return true; const x=new Set(a.split(' ')),y=new Set(b.split(' ')); const common=[...x].filter(t=>y.has(t)).length; return common / new Set([...x,...y]).size >= .9; }
export function validateBatch(raw: unknown, existing: Question[]) {
 const rows=Array.isArray(raw)?raw: raw && typeof raw==='object' && 'questions' in raw ? (raw as {questions:unknown}).questions : null;
 if (!Array.isArray(rows)) throw new Error('Expected a question array or { schemaVersion: 1, questions: [...] }.');
 const accepted: Question[]=[], rejected:{index:number;reason:string}[]=[], duplicates:{index:number;reason:string}[]=[];
 const seen=[...existing];
 rows.forEach((item,index)=>{
  if(!item || typeof item!=='object') {rejected.push({index,reason:'Not a question object'});return;}
  const q=item as Question;
  const required=['id','question','explanation','topic','sourceName','verification','createdAt'] as const;
  if(required.some(k=>typeof q[k]!=='string'||!q[k].trim())){rejected.push({index,reason:'Missing ID, question, explanation, topic, source, verification or timestamp'});return;}
  if(!Array.isArray(q.options)||q.options.length!==4||q.options.some(o=>typeof o!=='string'||!o.trim())||new Set(q.options.map(normalize)).size!==4){rejected.push({index,reason:'Exactly four distinct non-empty options required'});return;}
  if(!Number.isInteger(q.correctAnswer)||q.correctAnswer<0||q.correctAnswer>3){rejected.push({index,reason:'Correct answer index must be 0–3'});return;}
  if(!difficulties.includes(q.difficulty)||!Number.isFinite(Date.parse(q.createdAt))){rejected.push({index,reason:'Invalid difficulty or creation timestamp'});return;}
  if(q.sourceUrl && !/^https?:\/\//.test(q.sourceUrl)){rejected.push({index,reason:'Source URL must use HTTP or HTTPS'});return;}
  if(seen.some(s=>s.id===q.id||similar(normalize(s.question),normalize(q.question)))){duplicates.push({index,reason:'Duplicate ID or near-duplicate question text'});return;}
  if(seen.filter(s=>s.difficulty===q.difficulty).length>=TARGET){rejected.push({index,reason:`${q.difficulty} target of 500 reached`});return;}
  const safe={id:q.id,question:q.question.trim(),options:q.options.map(o=>o.trim()),correctAnswer:q.correctAnswer,explanation:q.explanation.trim(),topic:q.topic.trim(),difficulty:q.difficulty,sourceName:q.sourceName.trim(),sourceUrl:q.sourceUrl||'',verification:q.verification,createdAt:q.createdAt};
  accepted.push(safe);seen.push(safe);
 });
 return { accepted,rejected,duplicates,total:rows.length };
}
export function scoreQuestions(questions:Question[],answers:Record<string,number>) {
 const correct=questions.filter(q=>answers[q.id]===q.correctAnswer).length;
 const unanswered=questions.filter(q=>answers[q.id]===undefined).length;
 return {correct,unanswered,incorrect:questions.length-correct-unanswered,score:questions.length?Math.round(correct/questions.length*10000)/100:0};
}
export function queueIds(data: LearningData,queue:'bookmarked'|'incorrect'|'unanswered') {
 if(queue==='bookmarked') return new Set(data.bookmarks);
 return new Set(data.attempts.flatMap(a=>a.questions.filter(q=>queue==='unanswered'?a.answers[q.id]===undefined:a.answers[q.id]!==undefined&&a.answers[q.id]!==q.correctAnswer).map(q=>q.id)));
}
export function shuffle<T>(items:T[]) { const result=[...items]; for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const a=result[i],b=result[j];if(a!==undefined&&b!==undefined){result[i]=b;result[j]=a;}}return result; }
export function shuffleOptions(q:Question):Question {const indices=shuffle([0,1,2,3]);return {...q,options:indices.map(i=>q.options[i]??''),correctAnswer:indices.indexOf(q.correctAnswer)};}
export function topicStats(attempts:Attempt[]) {const stats:Record<string,{correct:number;total:number}>={}; attempts.forEach(a=>a.questions.forEach(q=>{const entry=stats[q.topic]??{correct:0,total:0};entry.total++;if(a.answers[q.id]===q.correctAnswer)entry.correct++;stats[q.topic]=entry;}));return Object.entries(stats).map(([topic,s])=>({topic,...s,accuracy:Math.round(s.correct/s.total*100)}));}
export function downloadJSON(filename:string,value:unknown) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function bankExport(questions:Question[]) { return {schemaVersion:1,exportedAt:new Date().toISOString(),questions}; }
