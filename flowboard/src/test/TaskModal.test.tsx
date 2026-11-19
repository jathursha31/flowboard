import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskModal from '../components/TaskModal.tsx';
import type { TaskChanges } from '../components/TaskModal.tsx';
import type { Person, Task } from '../types.ts';
import type { ComponentProps } from 'react';

// ✏️ Task popup: user type pannuradhu sariyaa save aagudhaa

const task: Task = {
  id: 't1',
  title: 'Write essay',
  description: '',
  priority: 'medium',
  dueDate: null,
  labels: [],
  checklist: [],
  comments: [],
  attachments: [],
  repeat: null,
  assigneeId: null,
  column: 'todo',
  order: 0,
};

const setup = (props: Partial<ComponentProps<typeof TaskModal>> = {}) => {
  const onSave = vi.fn(async (_changes: TaskChanges) => {});
  const onClose = vi.fn();
  render(<TaskModal task={task} onSave={onSave} onClose={onClose} onComment={vi.fn()} onDeleteComment={vi.fn()} {...props} />);
  return { onSave, onClose, user: userEvent.setup() };
};

describe('TaskModal', () => {
  it('saves edited fields, empty date as null and repeat', async () => {
    const { onSave, user } = setup();
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Write final essay');
    await user.click(screen.getByRole('button', { name: 'urgent' }));
    await user.selectOptions(screen.getByLabelText(/Repeat/), 'weekly');
    await user.type(screen.getByLabelText('New checklist item'), 'Outline{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0]!;
    expect(saved).toMatchObject({ title: 'Write final essay', labels: ['urgent'], repeat: 'weekly', dueDate: null });
    expect(saved.checklist).toEqual([expect.objectContaining({ text: 'Outline', done: false })]);
    expect(saved).not.toHaveProperty('assigneeId'); // share illaadha board: assign anuppa koodaadhu
  });

  it('shows "Assigned to" only on shared boards and sends the chosen person', async () => {
    const people: Person[] = [
      { id: 'u1', name: 'Anu', email: 'anu@test.local', avatarColor: '#5b5bf0' },
      { id: 'u2', name: 'Bala', email: 'bala@test.local', avatarColor: '#10b981' },
    ];
    const { onSave, user } = setup({ people });
    await user.selectOptions(screen.getByLabelText(/Assigned to/), 'u2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][0]!.assigneeId).toBe('u2');
  });

  it('blocks an empty title', async () => {
    const { onSave, user } = setup();
    await user.clear(screen.getByLabelText('Title'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required.')).toBeTruthy();
  });

  it('asks guests to log in instead of showing the upload button', () => {
    setup();
    expect(screen.getByText('Log in to attach files.')).toBeTruthy();
    expect(screen.queryByText('+ Attach a file')).toBeNull();
  });

  it('closes with Escape', async () => {
    const { onClose, user } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
