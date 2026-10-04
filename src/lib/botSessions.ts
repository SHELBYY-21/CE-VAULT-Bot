// Supabase-backed Telegram state. Firebase is no longer a runtime dependency.
import { createSupabaseAdminClient } from './supabase/admin';

export type SessionState = 'AWAITING_NAME' | 'AWAITING_AMOUNT' | 'EDITING' | 'WAITING_USDT';
export interface BotSession {
 chat_id: number; telegram_user_id: number; state: SessionState;
 pending_type?: 'THB_DEPOSIT' | 'USDT_SEND' | null;
 slip_url?: string | null; caption?: string | null; ocr_thb?: number | null;
 slip_date?: string | null; slip_time?: string | null; slip_last4?: string | null;
 slip_bank?: string | null; slip_receiver_name?: string | null;
 ocr_conf?: number | null; ledger_ref?: string | null; pending_usdt?: number | null;
 usdt_network?: string | null; usdt_txid?: string | null; usdt_image_url?: string | null;
 admin_id?: string | null; admin_name?: string | null; live_message_id?: number | null;
}
function db(){ return createSupabaseAdminClient(); }
function check(error: { message: string } | null){ if(error) throw new Error(error.message); }
export async function getSession(chatId:number,userId:number):Promise<BotSession|null>{
 const {data,error}=await db().from('bot_sessions').select('*').eq('chat_id',chatId).eq('telegram_user_id',userId).maybeSingle();
 check(error);return data as BotSession|null;
}
export async function setSession(chatId:number,userId:number,patch:Partial<Omit<BotSession,'chat_id'|'telegram_user_id'>>):Promise<void>{
 const current=await getSession(chatId,userId);
 const allowed=['admin_id','admin_name','state','pending_type','slip_url','caption','ocr_thb','pending_usdt','usdt_network','usdt_txid','usdt_image_url','ocr_conf','ledger_ref','slip_receiver_name','slip_date','slip_time','slip_last4','slip_bank','live_message_id'] as const;
 const row:Record<string,unknown>={...(current ?? {}),chat_id:chatId,telegram_user_id:userId,updated_at:new Date().toISOString()};
 for(const key of allowed) if(patch[key]!==undefined) row[key]=patch[key];
 if(!row.state && !current?.state) throw new Error('Session state required');
 if(!row.state) row.state=current!.state;
 const {error}=await db().from('bot_sessions').upsert(row,{onConflict:'chat_id,telegram_user_id'});check(error);
}
export async function clearSession(chatId:number,userId:number):Promise<void>{
 const {error}=await db().from('bot_sessions').delete().eq('chat_id',chatId).eq('telegram_user_id',userId);check(error);
}
export async function getChatRate(chatId:number):Promise<number|null>{
 const {data,error}=await db().from('chat_settings').select('sell_rate').eq('chat_id',chatId).maybeSingle();check(error);
 return data?.sell_rate==null?null:Number(data.sell_rate);
}
export async function setChatRate(chatId:number,rate:number,roomName?:string|null):Promise<void>{
 const {data:existing,error:readError}=await db().from('chat_settings').select('*').eq('chat_id',chatId).maybeSingle();check(readError);
 const row:Record<string,unknown>={...(existing ?? {}),chat_id:chatId,sell_rate:rate,updated_at:new Date().toISOString()};
 if(roomName)row.room_name=roomName;
 const {error}=await db().from('chat_settings').upsert(row,{onConflict:'chat_id'});check(error);
}
export async function getRoom(chatId:number):Promise<{rate:number|null;name:string|null;dayCutAt:string|null}>{
 const {data,error}=await db().from('chat_settings').select('sell_rate,room_name,day_cut_at').eq('chat_id',chatId).maybeSingle();check(error);
 return {rate:data?.sell_rate==null?null:Number(data.sell_rate),name:data?.room_name??null,dayCutAt:data?.day_cut_at??null};
}
export async function startNewDay(chatId:number):Promise<void>{
 const {error}=await db().from('chat_settings').upsert({chat_id:chatId,day_cut_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'chat_id'});check(error);
}
export async function setRoomName(chatId:number,name:string):Promise<void>{
 const {error}=await db().from('chat_settings').upsert({chat_id:chatId,room_name:name,updated_at:new Date().toISOString()},{onConflict:'chat_id'});check(error);
}
