import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from './firebase-config'; // Ensure you have this configured in your project
import { Plus, Edit2, Clock, CheckCircle, Archive } from 'lucide-react';
import './TasksPage.css'; // Optional CSS for styling

interface Job {
  id: string;
  text: string;
  stage: 'new' | 'due' | 'complete' | 'archived';
  dueDate: Timestamp;
  leadId?: string;
  assignedTo?: string;
}

const TasksPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: '', dueDate: '' });
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ text: '', dueDate: '' });

  // Real-time listener for tasks
  useEffect(() => {
    const q = query(collection(db, 'Jobs'), orderBy('dueDate', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedJobs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];
      // Filter out archived tasks
      const activeJobs = fetchedJobs.filter(job => job.stage !== 'archived');
      setJobs(activeJobs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStageChange = async (id: string, newStage: Job['stage']) => {
    try {
      const jobRef = doc(db, 'Jobs', id);
      await updateDoc(jobRef, { stage: newStage, updatedAt: Timestamp.now() });
    } catch (error) {
      console.error('Error updating stage:', error);
    }
  };

  const startEditing = (job: Job) => {
    setEditingId(job.id);
    const dateStr = job.dueDate ? job.dueDate.toDate().toISOString().split('T')[0] : '';
    setEditForm({ text: job.text, dueDate: dateStr });
  };

  const saveEdit = async (id: string) => {
    try {
      const jobRef = doc(db, 'Jobs', id);
      const newDate = new Date(editForm.dueDate);

      await updateDoc(jobRef, {
        text: editForm.text,
        dueDate: Timestamp.fromDate(newDate),
        updatedAt: Timestamp.now()
      });
      setEditingId(null);
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const createNewTask = async () => {
    if (!newTaskForm.text.trim()) {
      alert('Please enter a task description');
      return;
    }

    try {
      const dueDate = newTaskForm.dueDate
        ? Timestamp.fromDate(new Date(newTaskForm.dueDate))
        : Timestamp.now();

      await addDoc(collection(db, 'Jobs'), {
        text: newTaskForm.text,
        dueDate: dueDate,
        stage: 'new',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      setNewTaskForm({ text: '', dueDate: '' });
      setShowNewTaskForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    }
  };

  const archiveTask = async (id: string) => {
    try {
      const jobRef = doc(db, 'Jobs', id);
      await updateDoc(jobRef, {
        stage: 'archived',
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error archiving task:', error);
    }
  };

  const isOverdue = (dueDate: Timestamp): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = dueDate.toDate();
    taskDate.setHours(0, 0, 0, 0);
    return taskDate < today;
  };

  if (loading) return <div>Loading tasks...</div>;

  const renderTaskColumn = (stage: Job['stage'], title: string) => {
    const columnJobs = jobs.filter((job) => job.stage === stage);

    return (
      <div className="task-column">
        <h3>{title} ({columnJobs.length})</h3>
        {columnJobs.map((job) => {
          const overdue = isOverdue(job.dueDate);
          return (
            <div key={job.id} className={`task-card ${overdue ? 'overdue' : ''}`}>
              {editingId === job.id ? (
                <div className="task-edit-form">
                  <textarea
                    value={editForm.text}
                    onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  />
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  />
                  <button onClick={() => saveEdit(job.id)}>Save</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <p className="task-text"><strong>{job.text}</strong></p>
                  <div className="task-footer">
                    <p className="task-date">
                      {job.dueDate ? job.dueDate.toDate().toLocaleDateString() : 'No date'}
                    </p>
                    <div className="task-actions">
                      <button
                        onClick={() => startEditing(job)}
                        title="Edit task"
                        className="icon-btn"
                      >
                        <Edit2 size={18} />
                      </button>
                      {stage !== 'due' && (
                        <button
                          onClick={() => handleStageChange(job.id, 'due')}
                          title="Set due"
                          className="icon-btn"
                        >
                          <Clock size={18} />
                        </button>
                      )}
                      {stage !== 'complete' && (
                        <button
                          onClick={() => handleStageChange(job.id, 'complete')}
                          title="Mark complete"
                          className="icon-btn"
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => archiveTask(job.id)}
                        title="Archive task"
                        className="icon-btn archive-btn"
                      >
                        <Archive size={18} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <h2>Staff Tasks Assignment</h2>
        <button
          onClick={() => setShowNewTaskForm(!showNewTaskForm)}
          className="new-task-btn"
          title="Create new task"
        >
          <Plus size={24} />
        </button>
      </div>

      {showNewTaskForm && (
        <div className="new-task-form">
          <h3>Create New Task</h3>
          <textarea
            placeholder="Task description"
            value={newTaskForm.text}
            onChange={(e) => setNewTaskForm({ ...newTaskForm, text: e.target.value })}
          />
          <input
            type="date"
            value={newTaskForm.dueDate}
            onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}
          />
          <div className="form-actions">
            <button onClick={createNewTask} className="save-btn">Create Task</button>
            <button onClick={() => {
              setShowNewTaskForm(false);
              setNewTaskForm({ text: '', dueDate: '' });
            }} className="cancel-btn">Cancel</button>
          </div>
        </div>
      )}

      <div className="tasks-board">
        {renderTaskColumn('new', 'New Tasks')}
        {renderTaskColumn('due', 'Due / In Progress')}
        {renderTaskColumn('complete', 'Completed')}
      </div>
    </div>
  );
};

export default TasksPage;
