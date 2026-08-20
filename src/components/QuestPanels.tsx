import { useEffect, useRef, useState } from 'react';
import { Panel } from './ui';
import {
  formatDuration,
  getQuestLabel,
  getQuestProgress,
  nextQuestResetAt,
  QUEST_DIFFICULTY_COLORS,
  type QuestDefinition,
  type QuestRecord,
  type QuestRunStats,
} from '../game/quests';

interface QuestPanelProps {
  quests: QuestDefinition[];
  record: QuestRecord;
  run: QuestRunStats;
  compact?: boolean;
  announcement?: boolean;
  decorated?: boolean;
  onDayRollover?: () => void;
  onShare?: () => void;
}

function useQuestReset(onDayRollover?: () => void) {
  const [remaining, setRemaining] = useState(() => Math.max(0, nextQuestResetAt() - Date.now()));
  const targetRef = useRef(nextQuestResetAt());
  const onDayRolloverRef = useRef(onDayRollover);
  const rolledOverRef = useRef(false);
  const intervalRef = useRef(0);
  onDayRolloverRef.current = onDayRollover;

  useEffect(() => {
    const tick = () => {
      const ms = targetRef.current - Date.now();
      if (ms > 0) {
        setRemaining(ms);
        return;
      }
      setRemaining(0);
      window.clearInterval(intervalRef.current);
      if (!rolledOverRef.current) {
        rolledOverRef.current = true;
        onDayRolloverRef.current?.();
      }
      targetRef.current = nextQuestResetAt();
      rolledOverRef.current = false;
      intervalRef.current = window.setInterval(tick, 250);
    };
    window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalRef.current);
  }, []);

  return { remaining: Math.max(0, remaining) };
}

function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PixelGemIcon({ className = 'h-[8px] w-[6px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 6 8" className={`inline-block shrink-0 ${className}`} shapeRendering="crispEdges" aria-hidden="true">
      {/* Dark outline */}
      <rect x="0" y="1" width="6" height="6" fill="#08121e" />
      <rect x="1" y="0" width="4" height="8" fill="#08121e" />
      {/* Cyan jewel body */}
      <rect x="1" y="1" width="4" height="6" fill="#3ef2c8" />
      <rect x="0" y="2" width="6" height="4" fill="#3ef2c8" />
      {/* Radiant highlight */}
      <rect x="1" y="1" width="2" height="2" fill="#7ef7ff" />
      {/* Sparkle glint */}
      <rect x="1" y="2" width="1" height="1" fill="#ffffff" />
    </svg>
  );
}

export function PixelFlameIcon({ className = 'h-[8px] w-[7px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 7 8" className={`inline-block shrink-0 fill-[#ff4d6d] ${className}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="1" height="1" />
      <rect x="2" y="1" width="3" height="1" />
      <rect x="2" y="2" width="4" height="1" />
      <rect x="1" y="3" width="5" height="2" />
      <rect x="0" y="5" width="7" height="2" />
      <rect x="1" y="7" width="5" height="1" />
      <rect x="2" y="4" width="3" height="2" fill="#ffd166" />
    </svg>
  );
}

function QuestCard({ quest, record, run, compact }: { quest: QuestDefinition; record: QuestRecord; run: QuestRunStats; compact: boolean }) {
  const progress = getQuestProgress(quest, record, run);
  const color = QUEST_DIFFICULTY_COLORS[quest.difficulty];
  const textColor = quest.difficulty === 'impossible' ? '#ff6b8b' : color;
  const width = `${Math.round((progress.value / progress.target) * 100)}%`;
  return (
    <div
      className={`min-w-0 border-2 ${compact ? 'p-2' : 'p-2.5'} ${progress.done ? 'shadow-[2px_2px_0_#08040f]' : ''}`}
      style={{
        borderColor: `${color}99`,
        backgroundColor: progress.done ? `${color}22` : '#0d0619',
      }}
    >
      <div className="flex items-center justify-between gap-2 font-pixel text-[8px] leading-none">
        <span style={{ color: textColor }}>{progress.done ? 'COMPLETE' : quest.difficulty.toUpperCase()}</span>
        <div className="flex items-center gap-1 font-pixel text-[8px]">
          <span className="text-[#ffd166]">+{quest.reward}</span>
          <PixelGemIcon />
          <span className="ml-1 text-[#9d8fd6]">{quest.scope === 'day' ? 'TODAY' : 'RUN'}</span>
        </div>
      </div>
      <p className={`${compact ? 'mt-1 line-clamp-2 text-[8px]' : 'mt-2 min-h-[33px] text-[8px]'} font-pixel leading-[1.4] text-[#e9e2ff] ${progress.done ? 'text-white' : ''}`}>
        {getQuestLabel(quest)}
      </p>
      <div className={`${compact ? 'mt-1.5 h-2' : 'mt-2 h-2.5'} border border-[#2c1f4d] bg-[#08040f]`}>
        <div className="h-full" style={{ width, backgroundColor: progress.done ? '#ffffff' : color }} />
      </div>
      <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex justify-between font-pixel text-[8px] text-[#9d8fd6]`}>
        <span>{progress.done ? 'DONE' : `${progress.value}/${progress.target}`}</span>
        <span>{progress.done ? '100%' : `${Math.round((progress.value / progress.target) * 100)}%`}</span>
      </div>
    </div>
  );
}

export function DailyQuestPanel({ quests, record, run, compact = false, announcement = false, decorated = true, onDayRollover, onShare }: QuestPanelProps) {
  const { remaining } = useQuestReset(onDayRollover);
  const allDone = record.chestOpen;
  const tries = Math.max(record.tries, 1);
  const elapsed =
    record.completedAt !== null && record.firstRunAt !== null ? formatDuration(record.completedAt - record.firstRunAt) : null;
  return (
    <Panel decorated={decorated} className={`w-full ${compact ? 'p-2.5' : 'p-4'} border-2 border-[#3ef2c8] bg-[#140a26]/95 ${announcement ? 'bg-[#140a26]/80' : ''}`}>
      <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2">
          <h2 className="font-pixel text-[12px] text-[#3ef2c8]">{announcement ? 'DAILY QUESTS' : 'QUESTS'}</h2>
          {record.streak > 0 && (
            <span className="inline-flex items-center gap-1 border border-[#ff4d6d]/70 bg-[#250a18] px-1.5 py-0.5 font-pixel text-[7px] text-[#ff4d6d] shadow-[1px_1px_0_#08040f]">
              <PixelFlameIcon />
              <span>{record.streak}D STREAK</span>
            </span>
          )}
        </div>
        {!announcement && <span className="font-pixel text-[8px] text-[#9d8fd6]">NEXT {formatHms(remaining)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {quests.map((quest) => <QuestCard key={quest.id} quest={quest} record={record} run={run} compact={compact} />)}
      </div>
      {!announcement && (
        <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} border-t-2 border-[#251842] font-pixel text-[8px]`}>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            <span style={{ color: QUEST_DIFFICULTY_COLORS.easy }}>EASY {record.completedByDifficulty.easy}</span>
            <span style={{ color: QUEST_DIFFICULTY_COLORS.medium }}>MEDIUM {record.completedByDifficulty.medium}</span>
            <span style={{ color: QUEST_DIFFICULTY_COLORS.hard }}>HARD {record.completedByDifficulty.hard}</span>
            <span style={{ color: QUEST_DIFFICULTY_COLORS.special }}>SPECIAL {record.completedByDifficulty.special}</span>
            <span className="text-[#d1d5db]">IMPOSSIBLE {record.completedByDifficulty.impossible}</span>
          </div>
          {allDone && (
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="text-[#3ef2c8]">ALL DONE · {tries} TR{tries === 1 ? 'Y' : 'IES'}</span>
              {elapsed !== null && <span className="text-[#ffd166]">· {elapsed}</span>}
              {onShare && record.completedAt !== null && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onShare();
                  }}
                  className="pointer-events-auto cursor-pointer border-2 border-[#3ef2c8] bg-[#0d0619] px-2 py-1 text-[8px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow] duration-75 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  SHARE
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function DailyQuestAnnouncement({ quests, record, run, onDayRollover, onShare }: Omit<QuestPanelProps, 'compact' | 'announcement'>) {
  return (
    <div className="animate-quest-announcement pointer-events-none absolute top-3 left-1/2 z-30 w-[min(92vw,500px)] -translate-x-1/2 opacity-80">
      <DailyQuestPanel quests={quests} record={record} run={run} compact announcement decorated={false} onDayRollover={onDayRollover} onShare={onShare} />
    </div>
  );
}

export function QuestCompletionToast({ quests, completed, touch }: { quests: QuestDefinition[]; completed: string[]; touch: boolean }) {
  const labels = quests.filter((quest) => completed.includes(quest.id));
  const extras = completed.filter((id) => !quests.some((quest) => quest.id === id));
  if (labels.length === 0 && extras.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-quest-announcement pointer-events-none absolute z-30 w-[min(88vw,360px)] -translate-x-1/2 opacity-90 ${touch ? 'top-14 left-1/2' : 'top-14 left-1/2'}`}
    >
      <Panel decorated={false} className="border-2 bg-[#140a26] p-3 shadow-[3px_3px_0_#08040f]">
        <p className="font-pixel text-[10px] text-[#ffd166]">{labels.length > 0 ? 'QUEST COMPLETE' : 'SHARE'}</p>
        <div className="mt-2 space-y-1">
          {labels.map((quest) => (
            <p key={quest.id} className="font-pixel text-[8px] leading-[1.5] text-white">
              {getQuestLabel(quest)}
            </p>
          ))}
          {extras.map((text) => (
            <p key={text} className="font-pixel text-[8px] leading-[1.5] text-white">
              {text}
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
