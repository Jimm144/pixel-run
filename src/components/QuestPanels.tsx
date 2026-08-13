import { Panel } from './ui';
import {
  getQuestLabel,
  getQuestProgress,
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
}

function QuestCard({ quest, record, run, compact }: { quest: QuestDefinition; record: QuestRecord; run: QuestRunStats; compact: boolean }) {
  const progress = getQuestProgress(quest, record, run);
  const color = QUEST_DIFFICULTY_COLORS[quest.difficulty];
  const textColor = quest.difficulty === 'impossible' ? '#f3f4f6' : color;
  const width = `${Math.round((progress.value / progress.target) * 100)}%`;
  return (
    <div
      className={`min-w-0 border-2 ${compact ? 'p-2' : 'p-2.5'} ${progress.done ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.18)]' : ''}`}
      style={{
        borderColor: quest.difficulty === 'impossible' ? '#4b5563' : `${color}99`,
        backgroundColor: progress.done ? `${color}22` : quest.difficulty === 'impossible' ? '#020204' : '#0d0619',
      }}
    >
      <div className="flex items-center justify-between gap-2 font-pixel text-[6px] leading-none">
        <span style={{ color: textColor }}>{progress.done ? 'COMPLETE' : quest.difficulty.toUpperCase()}</span>
        <span className="text-[#6f5fa8]">{quest.scope === 'day' ? 'TODAY' : 'RUN'}</span>
      </div>
      <p className={`${compact ? 'mt-1 line-clamp-2 text-[7px]' : 'mt-2 min-h-[33px] text-[7px]'} font-pixel leading-[1.55] text-[#e9e2ff] ${progress.done ? 'text-white' : ''}`}>
        {getQuestLabel(quest)}
      </p>
      <div className={`${compact ? 'mt-1 h-1' : 'mt-2 h-2'} border border-[#2c1f4d] ${quest.difficulty === 'impossible' ? 'bg-[#374151]' : 'bg-[#08040f]'}`}>
        <div className="h-full" style={{ width, backgroundColor: progress.done ? '#ffffff' : color }} />
      </div>
      <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex justify-between font-pixel text-[6px] text-[#6f5fa8]`}>
        <span>{progress.done ? 'DONE' : `${progress.value}/${progress.target}`}</span>
        <span>{progress.done ? '100%' : `${Math.round((progress.value / progress.target) * 100)}%`}</span>
      </div>
    </div>
  );
}

export function DailyQuestPanel({ quests, record, run, compact = false, announcement = false, decorated = true }: QuestPanelProps) {
  return (
    <Panel decorated={decorated} className={`w-full ${compact ? 'p-2.5' : 'p-4'} border-2 border-[#3ef2c8] bg-[#140a26]/95 shadow-[0_0_24px_rgba(62,242,200,0.16)] ${announcement ? 'bg-[#140a26]/80' : ''}`}>
      <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-3`}>
        <h2 className="font-pixel text-[10px] text-[#3ef2c8]">{announcement ? 'DAILY QUESTS' : 'QUESTS'}</h2>
        {!announcement && <span className="font-pixel text-[6px] text-[#6f5fa8]">TODAY</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {quests.map((quest) => <QuestCard key={quest.id} quest={quest} record={record} run={run} compact={compact} />)}
      </div>
      {!announcement && (
        <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} flex flex-wrap justify-center gap-x-3 gap-y-1 border-t-2 border-[#221741] font-pixel text-[6px]`}>
          <span style={{ color: QUEST_DIFFICULTY_COLORS.easy }}>EASY {record.completedByDifficulty.easy}</span>
          <span style={{ color: QUEST_DIFFICULTY_COLORS.medium }}>MEDIUM {record.completedByDifficulty.medium}</span>
          <span style={{ color: QUEST_DIFFICULTY_COLORS.hard }}>HARD {record.completedByDifficulty.hard}</span>
          <span style={{ color: QUEST_DIFFICULTY_COLORS.special }}>SPECIAL {record.completedByDifficulty.special}</span>
          <span className="text-[#d1d5db]">IMPOSSIBLE {record.completedByDifficulty.impossible}</span>
        </div>
      )}
    </Panel>
  );
}

export function DailyQuestAnnouncement({ quests, record, run }: Omit<QuestPanelProps, 'compact' | 'announcement'>) {
  return (
    <div className="animate-quest-announcement pointer-events-none absolute top-3 left-1/2 z-30 w-[min(94vw,720px)] -translate-x-1/2 opacity-80">
      <DailyQuestPanel quests={quests} record={record} run={run} compact announcement decorated={false} />
    </div>
  );
}

export function QuestCompletionToast({ quests, completed, touch }: { quests: QuestDefinition[]; completed: string[]; touch: boolean }) {
  const labels = quests.filter((quest) => completed.includes(quest.id));
  if (labels.length === 0) return null;
  return (
    <div className={`animate-quest-announcement pointer-events-none absolute z-30 w-[min(88vw,360px)] -translate-x-1/2 opacity-85 ${touch ? 'top-24 left-1/2' : 'top-32 left-[calc(100%-190px)]'}`}>
      <Panel decorated={false} className="border-2 bg-[#140a26]/90 p-3 shadow-[0_0_24px_rgba(62,242,200,0.16)]">
        <p className="font-pixel text-[9px] text-[#ffd166]">QUEST COMPLETE</p>
        <div className="mt-2 space-y-1">
          {labels.map((quest) => (
            <p key={quest.id} className="font-pixel text-[7px] leading-[1.5] text-white">
              {getQuestLabel(quest)}
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
