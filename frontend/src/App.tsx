import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CustomerInfo } from './components/CustomerInfo';
import type { Conversation, Message } from './types';
import { fetchConversations, fetchMessages } from './services/api';
import { getSocket } from './services/socket';
import { MessageSquareText } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { token, isLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchConversations(token, {
        status: statusFilter,
        channel: channelFilter,
      });
      setConversations(data);

      // Select first if none selected
      if (!selectedConv && data.length > 0) {
        setSelectedConv(data[0]);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [token, statusFilter, channelFilter, selectedConv]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when selected conversation changes
  useEffect(() => {
    if (!token || !selectedConv) return;
    setIsLoadingMessages(true);
    fetchMessages(token, selectedConv.id)
      .then((msgs) => setMessages(msgs))
      .catch((err) => console.error('Failed to load messages:', err))
      .finally(() => setIsLoadingMessages(false));
  }, [token, selectedConv?.id]);

  // Realtime Socket.IO subscriptions
  useEffect(() => {
    const socket = getSocket();

    const handleNewMessage = (msg: Message) => {
      // 1. If currently viewing this conversation, append message
      if (selectedConv && selectedConv.id === msg.conversation_id) {
        setMessages((prev) => {
          // Avoid duplicate display
          if (prev.some((m) => m.id === msg.id || (m.id < 0 && m.text === msg.text))) {
            return prev.map((m) => (m.id < 0 && m.text === msg.text ? msg : m));
          }
          return [...prev, msg];
        });
      }

      // 2. Update conversation preview in sidebar
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === msg.conversation_id) {
            const isCurrentlyOpen = selectedConv && selectedConv.id === c.id;
            return {
              ...c,
              last_message_at: msg.created_at,
              last_message_text: msg.text,
              last_message_type: msg.type,
              last_message_direction: msg.direction,
              unread_count: isCurrentlyOpen ? 0 : c.unread_count + (msg.direction === 'in' ? 1 : 0),
            };
          }
          return c;
        })
      );
    };

    const handleConversationUpdated = (updated: Partial<Conversation> & { id: number }) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
      if (selectedConv && selectedConv.id === updated.id) {
        setSelectedConv((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', handleConversationUpdated);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:updated', handleConversationUpdated);
    };
  }, [selectedConv]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">
        <span className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-emerald-600 border-t-transparent mr-3" />
        <span className="text-base font-medium">กำลังเตรียมระบบ...</span>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* Left: Chat List */}
      <Sidebar
        conversations={conversations}
        selectedId={selectedConv?.id || null}
        onSelect={(conv) => setSelectedConv(conv)}
        channelFilter={channelFilter}
        setChannelFilter={setChannelFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      {/* Middle: Chat Area */}
      {selectedConv ? (
        <ChatArea
          token={token}
          conversation={selectedConv}
          messages={messages}
          onNewMessage={(newMsg) => setMessages((prev) => [...prev, newMsg])}
          onUpdateConversation={(updates) => {
            setSelectedConv((prev) => (prev ? { ...prev, ...updates } : prev));
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedConv.id ? { ...c, ...updates } : c))
            );
          }}
          isLoadingMessages={isLoadingMessages}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-8">
          <MessageSquareText className="w-16 h-16 mb-4 stroke-1 text-slate-300" />
          <h3 className="text-base font-bold text-slate-600 mb-1">เลือกรายการแชทเพื่อเริ่มสนทนา</h3>
          <p className="text-xs text-slate-400 text-center max-w-sm">
            เลือกแชทจากเมนูด้านซ้ายเพื่ออ่านประวัติ และพิมพ์ตอบกลับลูกค้าผ่าน LINE OA หรือ Messenger
          </p>
        </div>
      )}

      {/* Right: Customer & Info */}
      {selectedConv && (
        <CustomerInfo
          token={token}
          conversation={selectedConv}
          onUpdateConversation={(updates) => {
            setSelectedConv((prev) => (prev ? { ...prev, ...updates } : prev));
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedConv.id ? { ...c, ...updates } : c))
            );
          }}
        />
      )}
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}

export default App;
