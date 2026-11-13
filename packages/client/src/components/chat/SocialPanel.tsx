import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, Smile, X } from 'lucide-react';
import { REACTION_EMOJIS, type ChatMessage } from '@uno/shared';
import { AvatarIllustration } from '../avatars/AvatarIllustration.js';

interface SocialPanelProps {
  messages: readonly ChatMessage[];
  myPlayerId: string;
  chatOpen: boolean;
  onChatOpenChange: (open: boolean) => void;
  onSendChat: (text: string) => void;
  onSendReaction: (emoji: string) => void;
}

/** Floating quick emoji reaction picker and collapsible Chat & Table Log drawer. */
export function SocialPanel({
  messages,
  myPlayerId,
  chatOpen,
  onChatOpenChange,
  onSendChat,
  onSendReaction,
}: SocialPanelProps) {
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seenCount, setSeenCount] = useState(messages.length);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatOpen) {
      setSeenCount(messages.length);
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chatOpen, messages.length]);

  const unread = chatOpen ? 0 : Math.max(0, messages.length - seenCount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setDraft('');
  };

  return (
    <>
      {/* Compact bottom-corner triggers (positioned clear of player hand on mobile/desktop) */}
      <div className="relative z-30 flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiMenuOpen((prev) => !prev)}
            title="Send Emoji Reaction"
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold backdrop-blur-md transition active:scale-95 ${
              emojiMenuOpen
                ? 'border-amber-300/60 bg-amber-400/20 text-amber-200'
                : 'border-white/15 bg-slate-950/70 hover:bg-slate-900 text-white/90'
            }`}
          >
            <Smile className="w-4 h-4 text-amber-300" />
            <span className="hidden md:inline">React</span>
          </button>

          <AnimatePresence>
            {emojiMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.94 }}
                className="absolute right-0 bottom-full mb-2 flex items-center gap-1 rounded-2xl border border-white/15 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSendReaction(emoji);
                      setEmojiMenuOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-base hover:bg-white/15 active:scale-90 transition"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => {
            setEmojiMenuOpen(false);
            onChatOpenChange(!chatOpen);
          }}
          title="Table Chat & Feed"
          className={`relative inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold backdrop-blur-md transition active:scale-95 ${
            chatOpen
              ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
              : 'border-white/15 bg-slate-950/70 hover:bg-slate-900 text-white/90'
          }`}
        >
          <MessageCircle className="w-4 h-4 text-cyan-300" />
          <span className="hidden md:inline">Chat</span>
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>

      {/* Collapsible Chat & Event Feed Drawer */}
      <AnimatePresence>
        {chatOpen && (
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="fixed right-3 bottom-24 sm:bottom-28 z-40 flex h-80 w-[calc(100vw-1.5rem)] max-w-xs flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/92 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="font-display text-xs font-extrabold uppercase tracking-wider text-white">
                Table Chat &amp; Log
              </span>
              <button
                type="button"
                onClick={() => onChatOpenChange(false)}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2">
              {messages.length === 0 ? (
                <div className="py-10 text-center text-xs text-white/45">
                  Say hi or drop a reaction!
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.isSystem) {
                    return (
                      <div
                        key={msg.id}
                        className="rounded-xl bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-amber-200/85"
                      >
                        {msg.text}
                      </div>
                    );
                  }
                  const isMe = msg.senderId === myPlayerId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse text-right' : ''}`}
                    >
                      <AvatarIllustration avatarId={msg.avatarId} sizeClass="w-6 h-6 mt-0.5" />
                      <div
                        className={`max-w-[78%] rounded-2xl px-2.5 py-1.5 text-xs ${
                          isMe ? 'bg-cyan-500/25 text-cyan-50' : 'bg-white/10 text-white/90'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-white/60 mb-0.5">
                          {msg.senderName}
                        </div>
                        <div className="break-words">{msg.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-1.5 border-t border-white/10 p-2"
            >
              <input
                type="text"
                maxLength={200}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type message..."
                className="flex-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-xl bg-cyan-400 p-2 text-slate-950 hover:bg-cyan-300 disabled:opacity-40 transition"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
