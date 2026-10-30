import React, { useState } from 'react';
import type { Conversation } from '../types';
import { Search, MessageCircle } from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (conv: Conversation) => void;
  channelFilter: string;
  setChannelFilter: (c: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  selectedId,
  onSelect,
  channelFilter,
  setChannelFilter,
  statusFilter,
  setStatusFilter,
}) => {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      !search ||
      (c.customer_name && c.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      (c.last_message_text && c.last_message_text.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  });

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="w-80 md:w-96 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full select-none">
      {/* Header & Search */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">กล่องข้อความ</h2>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            {filtered.length} การสนทนา
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อลูกค้า หรือข้อความ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Filters: Channel & Status */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-1 scrollbar-none">
          {/* Channel pills */}
          <button
            onClick={() => setChannelFilter('')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              channelFilter === ''
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setChannelFilter('line')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              channelFilter === 'line'
                ? 'bg-[#06C755] text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#06C755] inline-block" />
            LINE OA
          </button>
          <button
            onClick={() => setChannelFilter('messenger')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              channelFilter === 'messenger'
                ? 'bg-[#0084FF] text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#0084FF] inline-block" />
            Messenger
          </button>

          {/* Status toggle */}
          <div className="h-4 w-px bg-slate-200 mx-1 flex-shrink-0" />

          <button
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'closed' : 'open')}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              statusFilter === 'open'
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {statusFilter === 'open' ? 'เปิดอยู่' : 'ปิดงานแล้ว'}
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <MessageCircle className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="text-sm">ไม่มีรายการแชทที่ตรงกัน</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const isLine = conv.channel_type === 'line';

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer relative ${
                  isSelected
                    ? 'bg-emerald-50/70 border-l-4 border-emerald-600'
                    : 'hover:bg-slate-50 border-l-4 border-transparent'
                }`}
              >
                {/* Avatar with Channel Badge */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 overflow-hidden border border-slate-200">
                    {conv.customer_avatar ? (
                      <img
                        src={conv.customer_avatar}
                        alt={conv.customer_name || ''}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (conv.customer_name || 'U')[0].toUpperCase()
                    )}
                  </div>
                  {/* Channel icon badge */}
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow-sm ${
                      isLine ? 'bg-[#06C755]' : 'bg-[#0084FF]'
                    }`}
                    title={isLine ? 'LINE OA' : 'Facebook Messenger'}
                  >
                    {isLine ? 'L' : 'M'}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h3
                      className={`text-sm truncate ${
                        conv.unread_count > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                      }`}
                    >
                      {conv.customer_name || `ผู้ใช้ ${conv.external_user_id.slice(-4)}`}
                    </h3>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>

                  {/* Last message preview */}
                  <p
                    className={`text-xs truncate ${
                      conv.unread_count > 0
                        ? 'font-medium text-slate-900'
                        : 'text-slate-500'
                    }`}
                  >
                    {conv.last_message_direction === 'out' && (
                      <span className="text-slate-400 font-normal">คุณ: </span>
                    )}
                    {conv.last_message_text || (conv.last_message_type ? `[${conv.last_message_type}]` : 'ยังไม่มีข้อความ')}
                  </p>
                </div>

                {/* Unread count badge */}
                {conv.unread_count > 0 && (
                  <span className="flex-shrink-0 ml-1 px-1.5 py-0.5 min-w-[20px] text-center text-[11px] font-bold bg-emerald-600 text-white rounded-full shadow-sm">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
