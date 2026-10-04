// ============================================================
// Receiver History — Firestore
// ============================================================
import { createHash } from 'crypto';
import { createSupabaseAdminClient } from './supabase/admin';
const db = () => createSupabaseAdminClient();
function checked(error: {message:string}|null){if(error)throw new Error(error.message);}


export interface ReceiverStats {
  id: string;
  bank: string | null;
  receiver_name: string | null;
  account_last4: string;
  total_transactions: number;
  total_amount_thb: number;
  total_usdt: number;
  max_amount_thb: number;
  last_amount_thb: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  last_ledger_ref: string | null;
  status: 'normal' | 'trusted' | 'blacklist';
  todayCount?: number;
  todayThb?: number;
}

export function receiverHash(bank: string | null | undefined, last4: string): string {
 return createHash('sha256').update(`${(bank || 'UNKNOWN').toUpperCase()}|${last4}`).digest('hex');
}
function mapReceiver(row: Record<string,unknown>):ReceiverStats {
 return {
 id:String(row.id),bank:(row.bank??row.bank_name??null) as string|null,
 receiver_name:(row.receiver_name??row.name??null) as string|null,
 account_last4:String(row.account_last4??row.last4??''),
 total_transactions:Number(row.total_transactions??0),
 total_amount_thb:Number(row.total_amount_thb??0),
 total_usdt:Number(row.total_usdt??0),
 max_amount_thb:Number(row.max_amount_thb??0),
 last_amount_thb:Number(row.last_amount_thb??0),
 first_transaction_at:row.first_transaction_at as string|null,
 last_transaction_at:row.last_transaction_at as string|null,
 last_ledger_ref:row.last_ledger_ref as string|null,
 status:(row.status??'normal') as ReceiverStats['status']
 };
}
export async function getReceiver(bank:string|null|undefined,last4:string):Promise<ReceiverStats|null>{
 const {data,error}=await db().from('receivers').select('*').eq('account_hash',receiverHash(bank,last4)).maybeSingle();checked(error);
 if(!data)return null;
 const start=new Date();start.setHours(0,0,0,0);
 const {data:rows,error:txError}=await db().from('transactions').select('thb_amount').eq('receiver_id',data.id).gte('created_at',start.toISOString());checked(txError);
 const stats=mapReceiver(data);return {...stats,todayCount:(rows??[]).length,todayThb:(rows??[]).reduce((sum,r)=>sum+Number(r.thb_amount??0),0)};
}
export async function findReceiversByLast4(last4:string):Promise<ReceiverStats[]>{
 const {data,error}=await db().from('receivers').select('*').eq('account_last4',last4).order('total_amount_thb',{ascending:false});checked(error);
 return (data??[]).map(mapReceiver);
}
export async function upsertReceiverOnDeposit(input:{
 bank:string|null;last4:string;receiverName:string|null;thb:number;usdt:number;ledgerRef:string;
}):Promise<string|null>{
 const hash=receiverHash(input.bank,input.last4);
 const {data,error}=await db().rpc('ce_upsert_receiver_on_deposit',{
 p_hash:hash,p_bank:input.bank,p_last4:input.last4,p_name:input.receiverName,
 p_thb:input.thb,p_usdt:input.usdt,p_ledger_ref:input.ledgerRef
 });
 checked(error);return data as string|null;
}
