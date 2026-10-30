import React, { useState, useEffect, useRef } from 'react';
import type { Conversation, Message } from '../types';
import { sendMessage, uploadMedia, markAsRead } from '../services/api';
import { Send, AlertTriangle, AlertCircle, RotateCcw, CheckCheck, Clock, Paperclip, Image as ImageIcon, X } from 'lucide-react';

interface ChatAreaProps {
  token: string;
  conversation: Conversation;
  messages: Message[];
  onNewMessage: (msg: Message) => void;
  onUpdateConversation: (conv: Partial<Conversation>) => void;
  isLoadingMessages: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  token,
  conversation,
  messages,
  onNewMessage,
  onUpdateConversation,
  isLoadingMessages,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check 24-hour policy for Messenger
  const isMessenger = conversation.channel_type === 'messenger';
  let is24hExpired = false;
  if (isMessenger && conversation.last_customer_message_at) {
    const diffHours =
      (Date.now() - new Date(conversation.last_customer_message_at).getTime()) /
      (1000 * 60 * 60);
    if (diffHours >= 24) {
      is24hExpired = true;
    }
  }

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filePreview]);

  // Mark as read when conversation is opened
  useEffect(() => {
    if (conversation.unread_count > 0) {
      markAsRead(token, conversation.id)
        .then(() => onUpdateConversation({ id: conversation.id, unread_count: 0 }))
        .catch(console.error);
    }
    inputRef.current?.focus();
  }, [conversation.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        setFilePreview(null);
      }
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if ((!text && !selectedFile) || isSending || is24hExpired) return;

    setIsSending(true);
    setSendError(null);

    let mediaUrl: string | undefined = undefined;
    let msgType: 'text' | 'image' | 'file' = 'text';

    try {
      // 1. Upload media if attached
      if (selectedFile) {
        const uploadRes = await uploadMedia(token, selectedFile);
        mediaUrl = uploadRes.url;
        msgType = uploadRes.type;
        clearSelectedFile();
      }

      if (!textToSend) {
        setInputText('');
      }

      const sent = await sendMessage(token, conversation.id, {
        text: text || undefined,
        mediaUrl,
        type: msgType,
      });

      onNewMessage(sent);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ';
      setSendError(errMessage);

      // Mark message as failed in UI
      const failedMsg: Message = {
        id: -Date.now(),
        conversation_id: conversation.id,
        direction: 'out',
        type: msgType,
        text: text || null,
        media_url: mediaUrl || null,
        external_msg_id: null,
        sent_by: null,
        status: 'failed',
        error: errMessage,
        created_at: new Date().toISOString(),
      };
      onNewMessage(failedMsg);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isLine = conversation.channel_type === 'line';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] relative">
      {/* Header */}
      <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 overflow-hidden border border-slate-200">
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
              className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold shadow-xs ${
                isLine ? 'bg-[#06C755]' : 'bg-[#0084FF]'
              }`}
            >
              {isLine ? 'L' : 'M'}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                {conversation.customer_name || `ผู้ใช้ ${conversation.external_user_id.slice(-4)}`}
              </h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isLine
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {isLine ? 'LINE Official Account' : 'Facebook Messenger'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              ID ลูกค้า: <code className="text-slate-500 font-mono text-[11px]">{conversation.external_user_id}</code>
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              conversation.status === 'open'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {conversation.status === 'open' ? 'สถานะ: เปิดรับเรื่อง' : 'สถานะ: ปิดงานแล้ว'}
          </span>
        </div>
      </div>

      {/* 24-hour Warning Banner for Messenger */}
      {is24hExpired && (
        <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-medium shadow-sm animate-fade-in">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้าแล้ว — ปิดการตอบกลับตามนโยบายความปลอดภัยของ Meta Messenger
          </span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <span className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent mr-2" />
            <span className="text-sm">กำลังโหลดประวัติข้อความ...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Clock className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
            <p className="text-sm">ยังไม่มีข้อความในการสนทนานี้</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCustomer = msg.direction === 'in';
            const isFailed = msg.status === 'failed';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs relative text-sm ${
                    isCustomer
                      ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                      : isFailed
                      ? 'bg-rose-50 text-rose-900 border border-rose-300 rounded-tr-xs'
                      : 'bg-emerald-600 text-white rounded-tr-xs'
                  }`}
                >
                  {/* Media / Image if exists */}
                  {msg.media_url && (
                    <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5">
                      <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={msg.media_url}
                          alt="รูปภาพแนบ"
                          className="max-h-72 max-w-full object-cover hover:opacity-95 transition-opacity"
                        />
                      </a>
                    </div>
                  )}

                  {/* Text content */}
                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}

                  {/* Footer (Time & Status) */}
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                      isCustomer ? 'text-slate-400' : isFailed ? 'text-rose-500' : 'text-emerald-100'
                    }`}
                  >
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {!isCustomer && !isFailed && <CheckCheck className="w-3.5 h-3.5" />}
                    {isFailed && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                  </div>
                </div>

                {/* Failed error & Retry button */}
                {isFailed && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-rose-600">
                    <span className="font-medium">ส่งไม่สำเร็จ: {msg.error || 'เครือข่ายขัดข้อง'}</span>
                    <button
                      onClick={() => handleSend(msg.text || '')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      ลองใหม่
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        {sendError && (
          <div className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center justify-between">
            <span>{sendError}</span>
            <button
              onClick={() => setSendError(null)}
              className="text-rose-400 hover:text-rose-600 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected File / Image Preview Bar */}
        {selectedFile && (
          <div className="mb-2 p-2.5 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              {filePreview ? (
                <img
                  src={filePreview}
                  alt="Preview"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-300 flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Paperclip className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-slate-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            <button
              onClick={clearSelectedFile}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="ยกเลิกไฟล์แนบ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            className="hidden"
          />

          {/* Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={is24hExpired || isSending}
            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
            title="แนบรูปภาพหรือไฟล์"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          <textarea
            ref={inputRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={is24hExpired || isSending}
            placeholder={
              is24hExpired
                ? 'ไม่สามารถส่งข้อความได้เนื่องจากเกิน 24 ชั่วโมง'
                : 'พิมพ์ข้อความตอบกลับ... (กด Enter เพื่อส่ง, Shift + Enter เพื่อขึ้นบรรทัดใหม่)'
            }
            className="flex-1 bg-transparent border-none resize-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none p-1.5 disabled:opacity-50"
          />

          <button
            onClick={() => handleSend()}
            disabled={(!inputText.trim() && !selectedFile) || isSending || is24hExpired}
            className={`p-3 rounded-xl transition-all cursor-pointer flex-shrink-0 shadow-sm ${
              (!inputText.trim() && !selectedFile) || isSending || is24hExpired
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
            }`}
            title="ส่งข้อความ (Enter)"
          >
            {isSending ? (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
