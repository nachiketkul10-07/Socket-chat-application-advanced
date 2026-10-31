import { useState, useEffect, useRef } from 'react';
import { wsService } from './websocket';
import { User, Conversation, Message, Notification, Suggestion, ServerMessage, GroupMember, TypingIndicator } from './types';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupMembersModal } from './components/GroupMembersModal';
import { TopNav } from './components/TopNav';
import { FillableMessageCard } from './components/FillableMessageCard';
import { FillableMessageBuilder } from './components/FillableMessageBuilder';
import { DeleteMessageModal } from './components/DeleteMessageModal';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [username, setUsername] = useState(() => localStorage.getItem('chat_username') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map());
  const [messageInput, setMessageInput] = useState('');
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeTab, setActiveTab] = useState<'direct' | 'group' | 'public'>('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileConversationListOpen, setIsMobileConversationListOpen] = useState(true);

  // Modals & Typing State
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isFillableBuilderOpen, setIsFillableBuilderOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [typingMap, setTypingMap] = useState<Map<string, string[]>>(new Map());
  const typingTimeoutRef = useRef<any>(null);
  const typingTimersRef = useRef<Map<string, any>>(new Map());

  // Message Deletion State
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<Message | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const touchTimerRef = useRef<any>(null);

  // Auto-authenticate saved user on page refresh or initial connect
  useEffect(() => {
    const savedUser = localStorage.getItem('chat_username');
    if (savedUser && !currentUser) {
      wsService.connect().then(() => {
        wsService.send({ type: 'auth', username: savedUser });
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const unsubMsg = wsService.onMessage(handleServerMessage);
    const unsubStatus = wsService.onStatusChange((status) => {
      setIsConnected(status);
      if (status && currentUser) {
        wsService.send({ type: 'auth', username: currentUser.username });
      }
    });
    return () => {
      unsubMsg();
      unsubStatus();
    };
  }, [currentUser]);

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'auth_success':
        setCurrentUser(message.user);
        setIsConnected(true);
        wsService.send({ type: 'fetch_conversations' });
        wsService.send({ type: 'fetch_users' });
        wsService.send({ type: 'fetch_notifications' });
        wsService.send({ type: 'fetch_suggestions' });
        break;

      case 'conversations':
        setConversations(message.conversations || []);
        if (!activeConversation && message.conversations && message.conversations.length > 0) {
          const pub = message.conversations.find((c: Conversation) => c.id === 'public_general') || message.conversations[0];
          if (pub) handleSelectConversation(pub.id);
        }
        break;

      case 'users': {
        const userMap = new Map<string, User>();
        (message.users || []).forEach((u: User) => userMap.set(u.id, u));
        setUsers(userMap);
        break;
      }

      case 'message':
        handleIncomingMessage(message.message || message);
        break;

      case 'history':
        setMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(message.conversationId, message.messages || []);
          return newMap;
        });
        break;

      case 'presence':
        if (message.user) {
          setUsers(prev => {
            const newMap = new Map(prev);
            newMap.set(message.user.id, message.user);
            return newMap;
          });
        }
        break;

      case 'typing': {
        const typingEvt = message as unknown as TypingIndicator;
        if (typingEvt.userId === currentUser?.id) break;
        const convId = typingEvt.conversationId;
        const timerKey = `${convId}_${typingEvt.username}`;

        if (typingTimersRef.current.has(timerKey)) {
          clearTimeout(typingTimersRef.current.get(timerKey));
          typingTimersRef.current.delete(timerKey);
        }

        setTypingMap(prev => {
          const newMap = new Map(prev);
          const currentTyping = newMap.get(convId) || [];
          if (typingEvt.isTyping) {
            if (!currentTyping.includes(typingEvt.username)) {
              newMap.set(convId, [...currentTyping, typingEvt.username]);
            }
          } else {
            newMap.set(convId, currentTyping.filter(name => name !== typingEvt.username));
          }
          return newMap;
        });

        // Auto-clear indicator after 3.5s in case user stops typing without explicit event
        if (typingEvt.isTyping) {
          const timer = setTimeout(() => {
            setTypingMap(prev => {
              const newMap = new Map(prev);
              const list = newMap.get(convId) || [];
              newMap.set(convId, list.filter(name => name !== typingEvt.username));
              return newMap;
            });
            typingTimersRef.current.delete(timerKey);
          }, 3500);
          typingTimersRef.current.set(timerKey, timer);
        }
        break;
      }

      case 'message_deleted': {
        const { messageId, conversationId, deleteMode } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          if (deleteMode === 'for_me') {
            newMap.set(conversationId, convMsgs.filter(m => m.id !== messageId));
          } else {
            newMap.set(conversationId, convMsgs.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  text: '🚫 This message was deleted',
                  content: '🚫 This message was deleted',
                  kind: 'deleted',
                  isDeleted: true,
                  fillable: undefined
                };
              }
              return m;
            }));
          }
          return newMap;
        });

        setConversations(prev => prev.map(c => {
          if (c.id === conversationId && deleteMode === 'for_everyone') {
            return { ...c, lastMessage: '🚫 Message was deleted' };
          }
          return c;
        }));
        break;
      }

      case 'group_members':
        if (message.members) {
          setGroupMembers(message.members);
        }
        break;

      case 'notifications':
        setNotifications(message.notifications || []);
        break;

      case 'notification':
        wsService.send({ type: 'fetch_notifications' });
        wsService.send({ type: 'fetch_conversations' });
        break;

      case 'suggestions':
        setSuggestions(message.suggestions || []);
        break;

      case 'conversation_created':
      case 'group_created':
        wsService.send({ type: 'fetch_conversations' });
        if (message.conversationId) {
          handleSelectConversation(message.conversationId);
        }
        break;

      case 'member_added':
      case 'member_removed':
      case 'group_left':
        wsService.send({ type: 'fetch_conversations' });
        if (activeConversation) {
          wsService.send({ type: 'fetch_group_members', conversationId: activeConversation });
        }
        break;

      case 'fillable_field_updated': {
        const { messageId, conversationId, field } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              const existingFields = m.fillable.fields || [];
              const fieldIdx = existingFields.findIndex(f => f.fieldId === field.fieldId);
              let newFields = [...existingFields];
              if (fieldIdx >= 0) {
                newFields[fieldIdx] = { ...newFields[fieldIdx], ...field };
              } else {
                newFields.push(field);
              }
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  fields: newFields,
                  updatedAt: Math.floor(Date.now() / 1000)
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_detail_appended': {
        const { messageId, conversationId, field } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              const existingFields = m.fillable.fields || [];
              const exists = existingFields.some(f => f.fieldId === field.fieldId);
              const newFields = exists
                ? existingFields.map(f => f.fieldId === field.fieldId ? { ...f, ...field } : f)
                : [...existingFields, field];
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  fields: newFields,
                  updatedAt: Math.floor(Date.now() / 1000)
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_detail_deleted': {
        const { messageId, conversationId, fieldId } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  fields: (m.fillable.fields || []).filter(f => f.fieldId !== fieldId),
                  updatedAt: Math.floor(Date.now() / 1000)
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_message_finalized': {
        const { messageId, conversationId, finalizedBy } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  status: 'finalized' as const,
                  finalizedBy,
                  finalizedAt: Math.floor(Date.now() / 1000)
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_message_reopened': {
        const { messageId, conversationId } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  status: 'open' as const,
                  finalizedBy: null,
                  finalizedAt: null
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_message_expired': {
        const { messageId, conversationId } = message;
        setMessages(prev => {
          const newMap = new Map(prev);
          const convMsgs = newMap.get(conversationId) || [];
          const updated = convMsgs.map(m => {
            if (m.id === messageId && m.fillable) {
              return {
                ...m,
                fillable: {
                  ...m.fillable,
                  status: 'expired' as const
                }
              };
            }
            return m;
          });
          newMap.set(conversationId, updated);
          return newMap;
        });
        break;
      }

      case 'fillable_field_conflict': {
        console.warn('[LCFM] Concurrency conflict detected:', message.message);
        break;
      }

      case 'error':
        console.error('[App] Server error:', message.message);
        break;
    }
  };

  const handleIncomingMessage = (msg: Message) => {
    setMessages(prev => {
      const newMap = new Map(prev);
      const convMessages = newMap.get(msg.conversationId) || [];
      const existingIdx = convMessages.findIndex(m => m.id === msg.id);

      if (existingIdx >= 0) {
        const updated = [...convMessages];
        updated[existingIdx] = {
          ...updated[existingIdx],
          ...msg,
          fillable: msg.fillable || updated[existingIdx].fillable
        };
        newMap.set(msg.conversationId, updated);
      } else {
        newMap.set(msg.conversationId, [...convMessages, msg]);
      }
      return newMap;
    });

    setConversations(prev => prev.map(conv => {
      if (conv.id === msg.conversationId) {
        const isCurrentActive = activeConversation === conv.id;
        const previewText = msg.kind === 'collaborative_fillin'
          ? '📋 Live Fill-in Message'
          : (msg.text || msg.content || 'New message');

        return {
          ...conv,
          lastMessage: previewText,
          lastMessageTime: msg.timestamp || msg.createdAt,
          lastMessageFrom: msg.fromUserId || msg.senderId,
          unreadCount: isCurrentActive ? 0 : (conv.unreadCount || 0) + 1
        };
      }
      return conv;
    }));
  };

  const handleLogin = async () => {
    if (!username.trim()) return;
    try {
      localStorage.setItem('chat_username', username.trim());
      if (!wsService.isConnected()) {
        await wsService.connect();
      }
      wsService.send({
        type: 'auth',
        username: username.trim()
      });
    } catch (err) {
      alert('Failed to connect to backend server. Make sure server is running.');
    }
  };

  const handleSelectConversation = (convId: string) => {
    setActiveConversation(convId);
    setIsMobileConversationListOpen(false);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
    wsService.send({ type: 'mark_read', conversationId: convId });

    if (!messages.has(convId)) {
      wsService.send({
        type: 'fetch_history',
        conversationId: convId,
        limit: 50
      });
    }

    const targetConv = conversations.find(c => c.id === convId);
    if (targetConv && targetConv.type === 'group') {
      wsService.send({ type: 'fetch_group_members', conversationId: convId });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (!activeConversation) return;

    wsService.send({
      type: 'typing',
      conversationId: activeConversation,
      isTyping: true
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsService.send({
        type: 'typing',
        conversationId: activeConversation,
        isTyping: false
      });
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !activeConversation) return;
    wsService.send({
      type: 'message',
      conversationId: activeConversation,
      text: messageInput.trim()
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    wsService.send({
      type: 'typing',
      conversationId: activeConversation,
      isTyping: false
    });

    setMessageInput('');
  };

  // ==========================================
  // Message Deletion Handlers
  // ==========================================
  const handlePromptDeleteMessage = (msg: Message) => {
    setDeleteTargetMessage(msg);
    setIsDeleteModalOpen(true);
  };

  // Mobile long-press touch handlers
  const handleTouchStart = (msg: Message) => {
    touchTimerRef.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      handlePromptDeleteMessage(msg);
    }, 500);
  };

  const handleTouchEndOrMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleDeleteForMe = (msg: Message) => {
    wsService.send({
      type: 'delete_message',
      messageId: msg.id,
      conversationId: msg.conversationId,
      deleteMode: 'for_me'
    });

    setMessages(prev => {
      const newMap = new Map(prev);
      const convMsgs = newMap.get(msg.conversationId) || [];
      newMap.set(msg.conversationId, convMsgs.filter(m => m.id !== msg.id));
      return newMap;
    });
  };

  const handleDeleteForEveryone = (msg: Message) => {
    wsService.send({
      type: 'delete_message',
      messageId: msg.id,
      conversationId: msg.conversationId,
      deleteMode: 'for_everyone'
    });

    setMessages(prev => {
      const newMap = new Map(prev);
      const convMsgs = newMap.get(msg.conversationId) || [];
      newMap.set(msg.conversationId, convMsgs.map(m => {
        if (m.id === msg.id) {
          return {
            ...m,
            text: '🚫 This message was deleted',
            content: '🚫 This message was deleted',
            kind: 'deleted',
            isDeleted: true,
            fillable: undefined
          };
        }
        return m;
      }));
      return newMap;
    });
  };

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    wsService.send({
      type: 'create_group',
      name,
      memberIds
    });
    setIsCreateGroupOpen(false);
  };

  const handleRemoveMember = (userId: string) => {
    if (!activeConversation) return;
    wsService.send({
      type: 'remove_group_member',
      conversationId: activeConversation,
      userId
    });
  };

  const handleLeaveGroup = () => {
    if (!activeConversation) return;
    wsService.send({
      type: 'leave_group',
      conversationId: activeConversation
    });
    setIsMembersModalOpen(false);
    setActiveConversation('public_general');
  };

  const handleOpenMembersModal = () => {
    if (activeConversation) {
      wsService.send({
        type: 'fetch_group_members',
        conversationId: activeConversation
      });
      setIsMembersModalOpen(true);
    }
  };

  const handleAcceptContact = (userId: string) => {
    wsService.send({
      type: 'create_direct',
      userId
    });
  };

  const handleStartDirectChat = (userId: string) => {
    wsService.send({
      type: 'create_direct',
      userId
    });
  };

  const handleOpenFillableBuilder = () => {
    setIsFillableBuilderOpen(true);
  };

  const getConversationParticipants = (): User[] => {
    if (!activeConversation) return [];
    if (activeConversation === 'public_general') {
      return Array.from(users.values());
    }
    const conv = conversations.find(c => c.id === activeConversation);
    if (conv && conv.type === 'direct') {
      return Array.from(users.values());
    }
    return groupMembers.map(m => ({
      id: m.id,
      username: m.username,
      isOnline: m.isOnline
    }));
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const getConversationName = (conv?: Conversation) => {
    if (!conv) return 'Unknown';
    if (conv.name) return conv.name;
    if (conv.type === 'public') return 'General Public Chat';
    return 'Chat';
  };

  const filteredConversations = conversations
    .filter(conv => conv.type === activeTab)
    .filter(conv => {
      if (!searchQuery) return true;
      const name = getConversationName(conv).toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });

  const activeConvMessages = activeConversation ? messages.get(activeConversation) || [] : [];
  const activeConvData = conversations.find(c => c.id === activeConversation);
  const activeTypingList = activeConversation ? typingMap.get(activeConversation) || [] : [];

  if (!currentUser) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>💬 Socket Chat Platform</h1>
          <p>Real-time C++ Winsock Multi-user Engine with LCFM</p>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            autoFocus
          />
          <button onClick={handleLogin}>Connect & Join</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopNav
        currentUser={currentUser}
        isConnected={isConnected}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLogout={() => {
          localStorage.removeItem('chat_username');
          wsService.disconnect();
          setCurrentUser(null);
          setUsername('');
        }}
      />

      <div className="main-content">
        <div className={`left-panel ${isMobileConversationListOpen ? 'mobile-visible' : ''}`}>
          <div className="chat-tabs">
            <button
              className={activeTab === 'public' ? 'active' : ''}
              onClick={() => setActiveTab('public')}
            >
              Public
            </button>
            <button
              className={activeTab === 'group' ? 'active' : ''}
              onClick={() => setActiveTab('group')}
            >
              Groups
            </button>
            <button
              className={activeTab === 'direct' ? 'active' : ''}
              onClick={() => setActiveTab('direct')}
            >
              Directs
            </button>
          </div>

          {activeTab === 'group' && (
            <div className="sidebar-action-bar">
              <button
                className="btn-create-group"
                onClick={() => setIsCreateGroupOpen(true)}
              >
                + Create New Group
              </button>
            </div>
          )}

          <div className="conversation-list">
            {filteredConversations.length === 0 ? (
              <div className="empty-state">No conversations found</div>
            ) : (
              filteredConversations.map(conv => {
                const convTyping = typingMap.get(conv.id) || [];
                return (
                  <div
                    key={conv.id}
                    className={`conversation-item ${activeConversation === conv.id ? 'active' : ''}`}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <div className="conv-avatar">
                      {getConversationName(conv).charAt(0).toUpperCase()}
                    </div>
                    <div className="conv-info">
                      <div className="conv-header">
                        <span className="conv-name">{getConversationName(conv)}</span>
                        {conv.lastMessageTime && (
                          <span className="conv-time">{formatTimestamp(conv.lastMessageTime)}</span>
                        )}
                      </div>
                      <div className={`conv-preview ${convTyping.length > 0 ? 'typing-indicator-preview' : ''}`}>
                        {convTyping.length > 0
                          ? `✍️ ${convTyping.join(', ')} typing...`
                          : (conv.lastMessage || 'No messages yet')}
                      </div>
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="unread-badge">{conv.unreadCount}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={`center-panel ${!isMobileConversationListOpen ? 'mobile-visible' : ''}`}>
          {activeConvData ? (
            <>
              <div className="chat-header">
                <div className="header-left">
                  <button
                    className="mobile-back-btn"
                    onClick={() => setIsMobileConversationListOpen(true)}
                    aria-label="Back to conversations"
                  >
                    ‹
                  </button>
                  <div className="header-avatar">
                    {getConversationName(activeConvData).charAt(0).toUpperCase()}
                  </div>
                  <div className="header-info">
                    <h2>{getConversationName(activeConvData)}</h2>
                    {activeTypingList.length > 0 ? (
                      <span className="status typing-live-text">
                        <span className="typing-pulse-dot"></span>
                        <strong>{activeTypingList.join(', ')}</strong> {activeTypingList.length === 1 ? 'is' : 'are'} typing...
                      </span>
                    ) : (
                      <span className="status">{activeConvData.type.toUpperCase()} Channel</span>
                    )}
                  </div>
                </div>
                <div className="header-actions">
                  {activeConvData.type === 'group' && (
                    <button className="btn-members-sm" onClick={handleOpenMembersModal}>
                      👥 Group Members
                    </button>
                  )}
                </div>
              </div>

              <div className="message-thread">
                {activeConvMessages.length === 0 ? (
                  <div className="empty-state">No messages in this chat yet.</div>
                ) : (
                  activeConvMessages.map(msg => {
                    const isDeleted = Boolean(msg.isDeleted || msg.kind === 'deleted');

                    // Check if it's a Live Collaborative Fill-in Message
                    if (msg.kind === 'collaborative_fillin' || msg.fillable) {
                      return (
                        <FillableMessageCard
                          key={msg.id}
                          message={msg}
                          currentUser={currentUser}
                          users={users}
                          onPromptDelete={handlePromptDeleteMessage}
                        />
                      );
                    }

                    const isOwn = (msg.fromUserId || msg.senderId) === currentUser.id;
                    const sender = users.get(msg.fromUserId || msg.senderId || '');

                    return (
                      <div
                        key={msg.id}
                        className={`message ${isOwn ? 'own' : 'other'} ${isDeleted ? 'message-deleted' : ''}`}
                        onDoubleClick={() => !isDeleted && handlePromptDeleteMessage(msg)}
                        onTouchStart={() => !isDeleted && handleTouchStart(msg)}
                        onTouchEnd={handleTouchEndOrMove}
                        onTouchMove={handleTouchEndOrMove}
                        title={isDeleted ? 'Deleted message' : 'Double-tap on PC or hold on mobile to delete'}
                      >
                        {!isOwn && (
                          <div className="message-avatar">
                            {sender?.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="message-content">
                          {!isOwn && (
                            <div className="message-sender">{sender?.username || 'User'}</div>
                          )}
                          <div className={`message-bubble ${isDeleted ? 'bubble-deleted' : ''}`}>
                            {isDeleted ? (
                              <span className="deleted-message-text">🚫 This message was deleted</span>
                            ) : (
                              msg.text || msg.content
                            )}
                          </div>
                          <div className="message-time">{formatTimestamp(msg.timestamp || msg.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Prominent Live Typing Bubble inside Message Thread */}
                {activeTypingList.length > 0 && (
                  <div className="live-typing-bubble-row">
                    <div className="live-typing-bubble">
                      <span className="typing-bubble-author">{activeTypingList.join(', ')}</span>
                      <span className="typing-bubble-label">typing</span>
                      <span className="typing-bubble-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {activeTypingList.length > 0 && (
                <div className="typing-indicator-bar">
                  ✍️ {activeTypingList.join(', ')} {activeTypingList.length === 1 ? 'is' : 'are'} typing...
                </div>
              )}

              <div className="message-composer">
                <button
                  type="button"
                  className="btn-create-fillable"
                  onClick={handleOpenFillableBuilder}
                  title="Create Live Collaborative Fill-in Message"
                >
                  📋 Live Fill-in
                </button>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button onClick={handleSendMessage}>Send</button>
              </div>
            </>
          ) : (
            <div className="no-conversation">
              <p>Select or create a conversation to start chatting</p>
            </div>
          )}
        </div>

        <div className={`right-panel ${isMobileConversationListOpen ? 'mobile-visible' : ''}`}>
          <div className="panel-section">
            <h3>Notifications ({notifications.filter(n => !n.isRead).length})</h3>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <p className="empty-state">No notifications</p>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}>
                    <div className="notif-text">{notif.text}</div>
                    <div className="notif-time">{formatTimestamp(notif.timestamp)}</div>
                    {notif.type === 'contact_request' && (
                      <button className="add-btn" onClick={() => handleAcceptContact(notif.actorId)}>
                        Accept
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel-section">
            <h3>Suggested Users</h3>
            <div className="suggestion-list">
              {suggestions.length === 0 ? (
                <p className="empty-state">No suggestions right now</p>
              ) : (
                suggestions.map(sug => (
                  <div key={sug.id} className="suggestion-item">
                    <div className="sug-avatar">{sug.username.charAt(0).toUpperCase()}</div>
                    <div className="sug-info">
                      <div className="sug-name">{sug.username}</div>
                      <div className="sug-status">
                        {sug.isOnline ? '🟢 Online' : '⚫ Offline'}
                      </div>
                    </div>
                    <button className="add-btn" onClick={() => handleStartDirectChat(sug.id)}>
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        availableUsers={Array.from(users.values())}
        currentUserId={currentUser.id}
        onCreateGroup={handleCreateGroup}
      />

      <GroupMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        groupName={activeConvData ? getConversationName(activeConvData) : ''}
        members={groupMembers}
        currentUserId={currentUser.id}
        isCreator={groupMembers.some(m => m.id === currentUser.id && m.isCreator)}
        onRemoveMember={handleRemoveMember}
        onLeaveGroup={handleLeaveGroup}
      />

      {activeConversation && (
        <FillableMessageBuilder
          isOpen={isFillableBuilderOpen}
          onClose={() => setIsFillableBuilderOpen(false)}
          conversationId={activeConversation}
          conversationParticipants={getConversationParticipants()}
          currentUserId={currentUser.id}
          onSubmit={(payload) => wsService.send(payload)}
        />
      )}

      {/* Delete Message Modal */}
      <DeleteMessageModal
        isOpen={isDeleteModalOpen}
        message={deleteTargetMessage}
        currentUser={currentUser}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTargetMessage(null);
        }}
        onDeleteForMe={handleDeleteForMe}
        onDeleteForEveryone={handleDeleteForEveryone}
      />
    </div>
  );
}

export default App;
