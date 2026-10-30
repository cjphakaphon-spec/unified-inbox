import React from 'react';
import type { Conversation } from '../types';
import { useAuth } from '../context/AuthContext';
import { updateConversation } from '../services/api';
import { User, Tag, Calendar, ShieldCheck, CheckCircle2, XCircle, LogOut } from 'lucide-react';

interface CustomerInfoProps {
  token: string;
  conversation: Conversation;
  onUpdateConversation: (updated: Partial<Conversation>) => void;
}

export const CustomerInfo: React.FC<CustomerInfoProps> = ({
  token,
  conversation,
  onUpdateConversation,
}) => {
  const { agent, logout } = useAuth();

  const handleToggleStatus = async () => {
    const nextStatus = conversation.status === 'open' ? 'closed' : 'open';
    try {
      const updated = await updateConversation(token, conversation.id, { status: nextStatus });
      onUpdateConversation(updated);
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const isLine = conversation.channel_type === 'line';

  return (
    <div className="w-72 bg-white border-l border-slate-200 h-full flex flex-col p-5 select-none overflow-y-auto">
      {/* Header Profile */}
      <div className="flex flex-col items-center text-center pb-5 border-b border-slate-100">
        <div className="relative mb-3">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xl border-2 border-slate-200 overflow-hidden shadow-xs">
            {conversation.customer_avatar ? (
              <img
                src={conversation.customer_avatar}
                alt={conversation.customer_name || ''}
                className="w-full h-full object-cover"
              />
            ) : (
              (conversation.customer_name || 'U')[0].toUpperCase()
            )}
          </div>
          <div
            className={`absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-white shadow-xs ${
              isLine ? 'bg-[#06C755]' : 'bg-[#0084FF]'
            }`}
          >
            {isLine ? 'L' : 'M'}
          </div>
        </div>

        <h3 className="font-bold text-slate-800 text-base">
          {conversation.customer_name || `ผู้ใช้ ${conversation.external_user_id.slice(-4)}`}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {isLine ? 'ลูกค้า LINE OA' : 'ลูกค้า Facebook Messenger'}
        </p>
      </div>

      {/* Details List */}
      <div className="py-5 space-y-4 border-b border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 font-medium block mb-1 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> ช่องทางติดต่อ
          </span>
          <span
            className={`font-semibold inline-block px-2.5 py-1 rounded-md text-[11px] ${
              isLine ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {isLine ? 'LINE Official Account' : 'Facebook Messenger'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 font-medium block mb-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> External User ID
          </span>
          <code className="bg-slate-50 border border-slate-200 px-2 py-1 rounded text-slate-700 block text-[11px] font-mono break-all">
            {conversation.external_user_id}
          </code>
        </div>

        <div>
          <span className="text-slate-400 font-medium block mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> ผู้รับผิดชอบการดูแล
          </span>
          <span className="text-slate-700 font-medium">
            {conversation.assigned_agent_name || 'ยังไม่มีผู้รับผิดชอบ'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 font-medium block mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> ข้อความล่าสุดเมื่อ
          </span>
          <span className="text-slate-700">
            {conversation.last_message_at
              ? new Date(conversation.last_message_at).toLocaleString('th-TH')
              : '-'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="py-5 space-y-2.5">
        <button
          onClick={handleToggleStatus}
          className={`w-full py-2.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            conversation.status === 'open'
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
          }`}
        >
          {conversation.status === 'open' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ทำเครื่องหมายว่า "ปิดงาน"</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-white" />
              <span>เปิดงานใหม่อีกครั้ง</span>
            </>
          )}
        </button>
      </div>

      {/* Staff footer */}
      <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 truncate">{agent?.name}</p>
          <p className="text-[11px] text-slate-400 truncate">{agent?.email}</p>
        </div>

        <button
          onClick={logout}
          title="ออกจากระบบ"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
