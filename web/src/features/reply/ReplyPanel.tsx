import * as Popover from '@radix-ui/react-popover';
import { Send, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Task } from '../../lib/api';

type ReplyPanelProps = {
  task?: Task;
  suffixEnabled: boolean;
  suffix: string;
  onSuffixEnabledChange: (enabled: boolean) => void;
  onSuffixChange: (suffix: string) => void;
  onSubmit: (task: Task, value: string, source: string) => Promise<void>;
};

export function ReplyPanel({
  task,
  suffixEnabled,
  suffix,
  onSuffixEnabledChange,
  onSuffixChange,
  onSubmit,
}: ReplyPanelProps) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!task) {
      setDraft('');
      return;
    }
    setDraft(localStorage.getItem(`askuser.drafts.${task.task_id}`) ?? '');
  }, [task]);

  const updateDraft = (value: string) => {
    setDraft(value);
    if (task) {
      localStorage.setItem(`askuser.drafts.${task.task_id}`, value);
    }
  };

  const submit = async () => {
    if (!task || !draft.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(task, draft, 'reply_panel');
      localStorage.removeItem(`askuser.drafts.${task.task_id}`);
      setDraft('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="reply-panel">
      <div className="panel-heading">
        <div>
          <strong>Reply</strong>
          <span>{task ? task.title : 'Select a pending task'}</span>
        </div>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" className="icon-button" title="Reply settings">
              <Settings2 size={17} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="settings-popover" align="end" sideOffset={8}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={suffixEnabled}
                  onChange={(event) => onSuffixEnabledChange(event.target.checked)}
                />
                Auto-append suffix
              </label>
              <label>
                Suffix
                <textarea
                  rows={5}
                  value={suffix}
                  onChange={(event) => onSuffixChange(event.target.value)}
                  placeholder="Text appended after each reply"
                />
              </label>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <textarea
        className="reply-textarea"
        disabled={task?.status !== 'pending'}
        value={draft}
        onChange={(event) => updateDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Write a reply..."
      />
      <button
        type="button"
        className="primary-button"
        disabled={!task || !draft.trim() || submitting}
        onClick={() => void submit()}
      >
        <Send size={16} />
        {submitting ? 'Sending...' : 'Submit reply'}
      </button>
    </aside>
  );
}
