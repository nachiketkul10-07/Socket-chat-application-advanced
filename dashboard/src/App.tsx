import { useState, useEffect, useRef } from 'react';
import { wsService } from './websocket';
import { User, Conversation, Message, Notification, Suggestion, ServerMessage, GroupMember, TypingIndicator } from './types';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupMembersModal } from './components/GroupMembersModal';
import { TopNav } from './components/TopNav';
import { FillableMessageCard } from './components/FillableMessageCard';
import { FillableMessageBuilder } from './components/FillableMessageBuilder';
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
        handleIncomingMessage(message as unknown as Message);
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
        setTypingMap(prev => {
          const newMap = new Map(prev);
          const currentTyping = newMap.get(typingEvt.conversationId) || [];
          if (typingEvt.isTyping) {
            if (!currentTyping.includes(typingEvt.username)) {
              newMap.set(typingEvt.conversationId, [...currentTyping, typingEvt.username]);
            }
          } else {
            newMap.set(typingEvt.conversationId, currentTyping.filter(name => name !== typingEvt.username));
          }
          return newMap;
        });
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

      // ==========================================
      // Live Collaborative Fill-in Messages (LCFM)
      // ==========================================
      case 'fillable_message_created': {
        if (message.message) {
          handleIncomingMessage(message.message);
        }
        break;
      }

      case 'fillable_message_updated': {
        const { messageId, conversationId, fillable } = message;
        if (fillable) {
          setMessages(prev => {
            const newMap = new Map(prev);
            const convMsgs = newMap.get(conversationId) || [];
            const updated = convMsgs.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  fillable
                };
              }
              return m;
            });
            newMap.set(conversationId, updated);
            return newMap;
          });
        }
        break;
      }

      case 'fillable_message_finalized':
      case 'fillable_message_reopened':
      case 'fillable_message_cancelled':
      case 'fillable_message_permission_updated': {
        const { messageId, conversationId, fillable } = message;
        if (fillable) {
          setMessages(prev => {
            const newMap = new Map(prev);
            const convMsgs = newMap.get(conversationId) || [];
            const updated = convMsgs.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  fillable
                };
              }
              return m;
            });
            newMap.set(conversationId, updated);
            return newMap;
          });
        }
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
        // Update in-place without duplicating
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

    // Refresh group members if group
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

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    wsService.send({
      type: 'create_group',
      name,
      memberIds
    });
  };

  const handleCreateDirectConversation = (userId: string) => {
    wsService.send({
      type: 'create_direct',
      userId
    });
  };

  const handleOpenMembersModal = () => {
    if (!activeConversation) return;
    wsService.send({ type: 'fetch_group_members', conversationId: activeConversation });
    setIsMembersModalOpen(true);
  };

  const handleOpenFillableBuilder = () => {
    if (!activeConversation) return;
    if (activeConvData?.type === 'group') {
      wsService.send({ type: 'fetch_group_members', conversationId: activeConversation });
    }
    setIsFillableBuilderOpen(true);
  };

  const handleRemoveMember = (targetUserId: string) => {
    if (!activeConversation) return;
    wsService.send({
      type: 'remove_group_member',
      conversationId: activeConversation,
      userId: targetUserId
    });
  };

  const handleLeaveGroup = () => {
    if (!activeConversation) return;
    wsService.send({
      type: 'leave_group',
      conversationId: activeConversation
    });
    setActiveConversation(null);
  };

  const handleContactRequest = (targetUserId: string) => {
    wsService.send({
      type: 'contact_request',
      userId: targetUserId
    });
  };

  const handleAcceptContact = (targetUserId: string) => {
    wsService.send({
      type: 'accept_contact',
      userId: targetUserId
    });
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const getConversationName = (conv: Conversation): string => {
    if (conv.name) return conv.name;
    if (conv.type === 'public') return 'General Public Chat';
    if (conv.type === 'direct' && currentUser) {
      const otherUserId = conv.id.replace('dm_', '').replace('direct_', '').split('_').find(id => id !== currentUser.id);
      const otherUser = otherUserId ? users.get(otherUserId) : null;
      return otherUser?.username || 'Direct Message';
    }
    return 'Conversation';
  };

  const getConversationParticipants = (): User[] => {
    if (!activeConvData) return [];
    if (activeConvData.type === 'group') {
      return groupMembers.map(gm => ({
        id: gm.id,
        username: gm.username,
        isOnline: gm.isOnline
      }));
    }
    if (activeConvData.type === 'direct' && currentUser) {
      const otherUserId = activeConvData.id.replace('dm_', '').replace('direct_', '').split('_').find(id => id !== currentUser.id);
      const other = otherUserId ? users.get(otherUserId) : null;
      return other ? [other] : [];
    }
    return Array.from(users.values());
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
              filteredConversations.map(conv => (
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
                    <div className="conv-preview">
                      {conv.lastMessage || 'No messages yet'}
                    </div>
                  </div>
                  {conv.unreadCount > 0 && (
                    <div className="unread-badge">{conv.unreadCount}</div>
                  )}
                </div>
              ))
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
                    <span className="status">{activeConvData.type.toUpperCase()} Channel</span>
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
                    // Check if it's a Live Collaborative Fill-in Message
                    if (msg.kind === 'collaborative_fillin' || msg.fillable) {
                      return (
                        <FillableMessageCard
                          key={msg.id}
                          message={msg}
                          currentUser={currentUser}
                          users={users}
                        />
                      );
                    }

                    const isOwn = (msg.fromUserId || msg.senderId) === currentUser.id;
                    const sender = users.get(msg.fromUserId || msg.senderId || '');

                    return (
                      <div key={msg.id} className={`message ${isOwn ? 'own' : 'other'}`}>
                        {!isOwn && (
                          <div className="message-avatar">
                            {sender?.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="message-content">
                          {!isOwn && (
                            <div className="message-sender">{sender?.username || 'User'}</div>
                          )}
                          <div className="message-bubble">{msg.text || msg.content}</div>
                          <div className="message-time">{formatTimestamp(msg.timestamp || msg.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
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
                    <button
                      className="add-btn"
                      onClick={() => handleCreateDirectConversation(sug.id)}
                    >
                      DM
                    </button>
                    <button
                      className="add-btn"
                      onClick={() => handleContactRequest(sug.id)}
                      title="Add Contact"
                    >
                      +
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
    </div>
  );
}

export default App;
