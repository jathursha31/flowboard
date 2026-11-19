import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskModal from '../components/TaskModal.tsx';
import TimelineView from '../components/TimelineView.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import type { Person, Task } from '../types.ts';

// 💬 @mention suggestions, 📊 timeline, 🌐 Tamil board text

const task: Task = {
  id: 't1', title: 'Logo', description: '', priority: 'high', dueDate: null, labels: [], checklist: [],
  comments: [{ id: 'c1', text: 'Thanks @Bala for this', author: 'Anu', createdAt: new Date().toISOString() }],
  attachments: [], repeat: null, assigneeId: null, column: 'todo', order: 0,
};
const people: Person[] = [
  { id: 'u1', name: 'Anu Raj', email: 'anu@test.local', avatarColor: '#5b5bf0' },
  { id: 'u2', name: 'Bala Murugan', email: 'bala@test.local', avatarColor: '#10b981' },
];

describe('@mentions in comments', () => {
  it('suggests teammates after @ and inserts the first name', async () => {
    const onComment = vi.fn(async () => {});
    const user = userEvent.setup();
    render(<TaskModal task={task} people={people} onSave={vi.fn()} onClose={vi.fn()} onComment={onComment} onDeleteComment={vi.fn()} />);

    const box = screen.getByLabelText<HTMLInputElement>('New comment');
    await user.type(box, 'Ping @ba');
    const list = within(screen.getByRole('listbox', { name: 'People' }));
    expect(list.getByRole('option', { name: /Bala Murugan/ })).toBeTruthy();
    expect(list.queryByRole('option', { name: /Anu Raj/ })).toBeNull();
    await user.click(list.getByRole('option', { name: /Bala Murugan/ }));
    expect(box.value).toBe('Ping @Bala ');

    await user.type(box, 'please{Enter}');
    expect(onComment).toHaveBeenCalledWith('Ping @Bala please');
  });

  it('highlights mentions in existing comments', () => {
    render(<TaskModal task={task} people={people} onSave={vi.fn()} onClose={vi.fn()} onComment={vi.fn()} onDeleteComment={vi.fn()} />);
    expect(screen.getByText('@Bala').tagName).toBe('MARK');
  });
});

describe('TimelineView', () => {
  it('draws one bar per task with a due date and opens it on click', async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const onOpen = vi.fn();
    const tasks = [
      { ...task, id: 'a', title: 'With date', dueDate: today, createdAt: new Date(Date.now() - 2 * 864e5).toISOString(), column: 'todo' },
      { ...task, id: 'b', title: 'No date', dueDate: null, column: 'todo' },
    ];
    render(<TimelineView tasks={tasks} doneColumn="done" onOpen={onOpen} />);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1 task
    await userEvent.setup().click(screen.getByRole('button', { name: /^With date:/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('explains what to do when no task has a due date', () => {
    render(<TimelineView tasks={[{ ...task, dueDate: null }]} doneColumn="done" onOpen={vi.fn()} />);
    expect(screen.getByText(/Add due dates/)).toBeTruthy();
  });
});

describe('board text in Tamil', () => {
  it('shows the task popup in Tamil when Tamil is chosen (Tamil file loads on demand)', async () => {
    localStorage.setItem('flowboard-lang', 'ta');
    render(
      <LanguageProvider>
        <TaskModal task={task} onSave={vi.fn()} onClose={vi.fn()} onComment={vi.fn()} onDeleteComment={vi.fn()} />
      </LanguageProvider>
    );
    expect(await screen.findByRole('heading', { name: '✏️ டாஸ்க்கைத் திருத்து' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'சேமி' })).toBeTruthy();
  });
});

describe('view-only (viewer role)', () => {
  it('disables every field and hides save, comment and upload', () => {
    render(<TaskModal task={task} people={people} readOnly onSave={vi.fn()} onClose={vi.fn()} onComment={vi.fn()} onDeleteComment={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByLabelText('Title').matches(':disabled')).toBe(true); // fieldset disabled
    expect(screen.getByLabelText(/Repeat/).matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByLabelText('New comment')).toBeNull();
    expect(screen.queryByText('+ Attach a file')).toBeNull();
    expect(screen.getByText('👀 View only')).toBeTruthy();
  });
});
