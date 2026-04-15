import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase-config'; // Ensure you have this configured in your project
import './TasksPage.css'; // Optional CSS for styling

interface Job {
  id: string;
  text: string;
  stage: 'new' | 'due' | 'complete';
  dueDate: Timestamp;
  leadId?: string;
  assignedTo?: string;
}

const TasksPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: '', dueDate: '' });

  // Real-time listener for tasks
  useEffect(() => {
    const q = query(collection(db, 'Jobs'), orderBy('dueDate', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedJobs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];
      setJobs(fetchedJobs);
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

  if (loading) return <div>Loading tasks...</div>;

  const renderTaskColumn = (stage: Job['stage'], title: string) => {
    const columnJobs = jobs.filter((job) => job.stage === stage);

    return (
      <div className="task-column">
        <h3>{title} ({columnJobs.length})</h3>
        {columnJobs.map((job) => (
          <div key={job.id} className="task-card">
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
                <p><strong>{job.text}</strong></p>
                <p>Due: {job.dueDate ? job.dueDate.toDate().toLocaleDateString() : 'No date'}</p>
                <div className="task-actions">
                  <button onClick={() => startEditing(job)}>Edit</button>
                  {stage !== 'new' && <button onClick={() => handleStageChange(job.id, 'new')}>Set New</button>}
                  {stage !== 'due' && <button onClick={() => handleStageChange(job.id, 'due')}>Set Due</button>}
                  {stage !== 'complete' && <button onClick={() => handleStageChange(job.id, 'complete')}>Mark Complete</button>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="tasks-page">
      <h2>Staff Tasks Assignment</h2>
      <div className="tasks-board">
        {renderTaskColumn('new', 'New Tasks')}
        {renderTaskColumn('due', 'Due / In Progress')}
        {renderTaskColumn('complete', 'Completed')}
      </div>
    </div>
  );
};

export default TasksPage;
