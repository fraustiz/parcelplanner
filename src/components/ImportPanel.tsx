'use client';

import { useRef } from 'react';

import type { ImportReport, TemplateProblem } from '@/core/import-plan';
import type { SaveDelivery } from '@/core/import-save';
import type { Plan } from '@/core/types';
import { DOOR_TIMER_SECONDS, EXPORT_TRUCK_PARCELS, PARCELS_PER_TRUCK } from '@/data/deliveries';
import { t, type Locale, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { useDialog } from './use-dialog';

/**
 * The dialog every spreadsheet or game-save import goes through. An import
 * never lands in silence: a cell names an object but rarely its facing, and a
 * save holds things the planner leaves out. The plan is built first and
 * loaded only on a press.
 *
 *   `unreadable`  not an .xlsx (or not a save) at all.
 *   `refused`     wrong version, missing sheet or moved doors. No override:
 *                 a shifted grid looks normal and is wrong in every cell.
 *   `ready`       the caution, what was read, what was guessed, and a button.
 */

/** What was imported: the community spreadsheet or a game save. */
export type ImportSource = 'template' | 'save';

export type ImportOutcome =
  | { kind: 'unreadable'; source: ImportSource }
  | { kind: 'refused'; problems: TemplateProblem[] }
  | { kind: 'ready'; source: ImportSource; plan: Plan; report: ImportReport; delivery?: SaveDelivery };

/** The texts that differ between the two sources; the rest are shared. */
const SOURCE_TEXT: Record<ImportSource, Record<'caution' | 'cautionWhy' | 'empty' | 'unknown' | 'dropped' | 'unreadableWhy', TranslationKey>> = {
  template: {
    caution: 'import.caution', cautionWhy: 'import.cautionWhy', empty: 'import.empty',
    unknown: 'import.unknown', dropped: 'import.dropped', unreadableWhy: 'import.unreadableWhy',
  },
  save: {
    caution: 'import.saveCaution', cautionWhy: 'import.saveCautionWhy', empty: 'import.saveEmpty',
    unknown: 'import.saveUnknown', dropped: 'import.saveDropped', unreadableWhy: 'import.saveUnreadableWhy',
  },
};

/** `t` has no interpolation on purpose (see src/i18n/index.ts), so a counted
 * line is built here: the number, then the phrase it counts. */
const counted = (locale: Locale, n: number, key: TranslationKey) => `${n} ${t(locale, key)}`;

const PROBLEM_TEXT: Record<TemplateProblem['kind'], TranslationKey> = {
  'missing-sheet': 'import.problemSheet',
  'wrong-version': 'import.problemVersion',
  'doors-moved': 'import.problemDoors',
};

/** The sheet or version a problem is about, so the line names something to check. */
function problemDetail(problem: TemplateProblem): string {
  if (problem.kind === 'wrong-version') return problem.found ?? 'n/a';
  return problem.sheet;
}

function Button(
  { onClick, label, tone }: { onClick: () => void; label: string; tone: 'primary' | 'quiet' },
) {
  const style = tone === 'primary'
    ? 'border border-transparent bg-[var(--tint-accent)] text-[var(--accent)] hover:border-[var(--accent)] active:translate-y-px active:bg-[var(--tint-warm)]'
    : 'border border-transparent text-[var(--text-muted)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:translate-y-px';
  return (
    <button type="button" onClick={onClick} className={`rounded px-3 py-1.5 text-sm ${style}`}>
      {label}
    </button>
  );
}

export default function ImportPanel(
  { outcome, onConfirm, onClose }: {
    outcome: ImportOutcome;
    /** Also given the delivery levels a game save carries. */
    onConfirm: (plan: Plan, delivery?: SaveDelivery) => void;
    onClose: () => void;
  },
) {
  const locale = useEditor((s) => s.locale);
  const say = (key: TranslationKey) => t(locale, key);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, true, { onClose, modal: true });

  const ready = outcome.kind === 'ready' ? outcome : null;
  const empty = ready !== null && ready.report.placed === 0;
  const text = SOURCE_TEXT[outcome.kind === 'refused' ? 'template' : outcome.source];

  const title = outcome.kind === 'unreadable' ? say('import.unreadable')
    : outcome.kind === 'refused' ? say('import.refused')
      : empty ? say(text.empty)
        : say(text.caution);

  // Empty needs no body: its title says it all.
  const body = outcome.kind === 'unreadable' ? say(text.unreadableWhy)
    : outcome.kind === 'refused' ? say('import.refusedWhy')
      : empty ? '' : say(text.cautionWhy);

  // What landed, where, then what was guessed or left out.
  const lines: string[] = [];
  if (ready && !empty) {
    lines.push(counted(locale, ready.report.placed, 'import.read'));
    for (const { warehouse, placed } of ready.report.byWarehouse) {
      lines.push(counted(
        locale, placed, warehouse === 'main' ? 'import.inMain' : 'import.inSecond'));
    }
    if (ready.report.rotationUnknown > 0) {
      lines.push(counted(locale, ready.report.rotationUnknown, 'import.rotationUnknown'));
    }
    if (ready.report.unknown.length > 0) {
      lines.push(counted(locale, ready.report.unknown.length, text.unknown));
    }
    if (ready.report.dropped.length > 0) {
      lines.push(counted(locale, ready.report.dropped.length, text.dropped));
    }
    if (ready.delivery) {
      const parcels = PARCELS_PER_TRUCK[ready.delivery.sizeLevel];
      const seconds = DOOR_TIMER_SECONDS[ready.delivery.speedLevel];
      lines.push(`${say('import.saveDelivery')} ${parcels} ${say('import.saveDeliveryParcels')}, ${seconds} s`);
      const exported = EXPORT_TRUCK_PARCELS[ready.delivery.exportLevel];
      lines.push(`${say('import.saveExports')} ${exported} ${say('import.saveDeliveryParcels')}, ${say(ready.delivery.automaticExports ? 'import.saveExportsAuto' : 'import.saveExportsByHand')}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-[var(--raised)] bg-[var(--panel)] p-4 shadow-xl"
      >
        <h2 className="mb-2 text-sm font-medium text-[var(--text-strong)]">{title}</h2>
        {body !== '' && <p className="mb-3 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>}

        {outcome.kind === 'refused' && (
          <ul className="mb-4 space-y-1 text-sm text-[var(--warning)]">
            {outcome.problems.map((problem, i) => (
              <li key={i}>
                {say(PROBLEM_TEXT[problem.kind])}
                <span className="text-[var(--text-muted)]">: {problemDetail(problem)}</span>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm text-[var(--text-muted)]">
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}

        {ready && !empty && (
          <p className="mb-4 text-sm text-[var(--text-muted)]">{say('import.replaces')}</p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            tone="quiet"
            onClick={onClose}
            label={say(ready && !empty ? 'import.cancel' : 'import.close')}
          />
          {ready && !empty && (
            <Button tone="primary" onClick={() => onConfirm(ready.plan, ready.delivery)} label={say('import.confirm')} />
          )}
        </div>
      </div>
    </div>
  );
}
