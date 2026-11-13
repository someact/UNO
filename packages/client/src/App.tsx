import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, WifiOff, X } from 'lucide-react';
import { MODE_PRESETS, type GameMode } from '@uno/shared';
import { HomeScreen } from './components/home/HomeScreen.js';
import { LobbyScreen } from './components/lobby/LobbyScreen.js';
import { ModeRulesModal } from './components/modals/ModeRulesModal.js';
import { GameTable } from './components/table/GameTable.js';
import { TopBar } from './components/table/TopBar.js';
import { getRoomCodeFromUrl, useUnoClient } from './hooks/useUnoClient.js';
import { soundEngine } from './sound/soundEngine.js';
import { TABLE_THEMES, type TableThemeId } from './theme/tableThemes.js';

const THEME_STORAGE_KEY = 'multi_uno_theme';

function loadSavedTheme(): TableThemeId {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'emerald' || val === 'neon' || val === 'wood') return val;
  } catch {
    // Ignore storage access errors.
  }
  return 'emerald';
}

/** Root live multiplayer Multi-UNO client coordinating Home, Lobby, Table, Rules, and toasts. */
export function App() {
  const client = useUnoClient();
  const [themeId, setThemeId] = useState<TableThemeId>(loadSavedTheme);
  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [hapticsEnabled, setHapticsEnabled] = useState(() => soundEngine.isHapticsEnabled());
  const [rulesModalState, setRulesModalState] = useState<{ open: boolean; mode?: GameMode }>({
    open: false,
  });

  const initialRoomCode = useMemo(() => getRoomCodeFromUrl(), []);
  const theme = TABLE_THEMES[themeId];

  const handleThemeChange = (next: TableThemeId) => {
    soundEngine.unlock();
    setThemeId(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors.
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
  };

  const handleToggleHaptics = () => {
    const next = !hapticsEnabled;
    soundEngine.setHapticsEnabled(next);
    setHapticsEnabled(next);
  };

  const openRules = (mode?: GameMode) => {
    soundEngine.unlock();
    setRulesModalState({ open: true, mode });
  };

  const inLiveGame = Boolean(client.roomState && client.gameState && client.myPlayerId);

  return (
    <div
      className={`relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b ${theme.backdropClass}`}
      style={{ backgroundImage: theme.surfaceGradient }}
      onPointerDown={() => soundEngine.unlock()}
    >
      <div className="pointer-events-none absolute inset-0 felt-texture" />

      {inLiveGame && client.roomState && client.gameState && client.myPlayerId ? (
        <GameTable
          room={client.roomState}
          gameState={client.gameState}
          myPlayerId={client.myPlayerId}
          chatMessages={client.chatMessages}
          reactionsByPlayer={client.reactionsByPlayer}
          actionBanner={client.actionBanner}
          themeId={themeId}
          onChangeTheme={handleThemeChange}
          muted={muted}
          onToggleMute={handleToggleMute}
          hapticsEnabled={hapticsEnabled}
          onToggleHaptics={handleToggleHaptics}
          onSendGameAction={client.sendGameAction}
          onNextRound={client.nextRound}
          onRematch={client.rematch}
          onReturnToLobby={client.returnToLobby}
          onLeaveRoom={client.leaveRoom}
          onSendChat={(text) => {
            void client.sendChat(text);
          }}
          onSendReaction={(emoji) => {
            void client.sendReaction(emoji);
          }}
          onOpenRules={openRules}
        />
      ) : (
        <>
          <TopBar
            title="Multi-UNO"
            subtitle={
              client.roomState
                ? `Lobby ${client.roomState.roomId} • ${MODE_PRESETS[client.roomState.config.mode].label}`
                : 'Play Online with Friends & Bots'
            }
            themeId={themeId}
            onChangeTheme={handleThemeChange}
            muted={muted}
            onToggleMute={handleToggleMute}
            hapticsEnabled={hapticsEnabled}
            onToggleHaptics={handleToggleHaptics}
          />

          {client.roomState && client.myPlayerId ? (
            <LobbyScreen
              room={client.roomState}
              myPlayerId={client.myPlayerId}
              onLeave={client.leaveRoom}
              onUpdateConfig={client.updateConfig}
              onAddBot={() => client.addBot()}
              onRemovePlayer={client.removePlayer}
              onTransferHost={client.transferHost}
              onToggleReady={client.toggleReady}
              onStartMatch={client.startMatch}
              onOpenRules={openRules}
            />
          ) : (
            <HomeScreen
              playerName={client.myName}
              onChangeName={client.setMyName}
              avatarId={client.myAvatarId}
              onChangeAvatar={client.setMyAvatarId}
              initialRoomCode={initialRoomCode}
              publicRooms={client.publicRooms}
              connected={client.connected}
              onCreateRoom={({ playerName, mode, isPublic }) =>
                client.createRoom({ playerName, mode, configOverrides: { isPublic } })
              }
              onJoinRoom={({ roomId, playerName }) =>
                client.joinRoom({ roomId, playerName })
              }
              onRefreshPublicRooms={client.refreshPublicRooms}
              onOpenRules={openRules}
            />
          )}
        </>
      )}

      {/* Connection Status Pill */}
      <AnimatePresence>
        {(!client.connected || client.reconnecting) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pointer-events-none fixed left-1/2 top-14 z-50 -translate-x-1/2"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-slate-950/90 px-3.5 py-1.5 text-xs font-bold text-amber-200 shadow-xl backdrop-blur-md">
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
              {client.reconnecting ? 'Reconnecting to table...' : 'Connecting to server...'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {client.errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className="fixed bottom-4 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2"
          >
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-rose-400/50 bg-rose-950/95 px-4 py-2.5 text-xs font-bold text-rose-100 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-300" />
                <span className="truncate">{client.errorToast}</span>
              </div>
              <button
                type="button"
                onClick={client.clearError}
                className="rounded-lg p-1 text-rose-200/80 hover:bg-white/10"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Rules & Controls Modal */}
      <ModeRulesModal
        open={rulesModalState.open}
        activeMode={rulesModalState.mode}
        onClose={() => setRulesModalState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
