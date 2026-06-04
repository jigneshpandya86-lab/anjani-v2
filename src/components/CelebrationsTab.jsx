import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase-config';
import { Gift, Calendar, Trash2, Edit2, User, Phone, BookOpen, Search, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

const RELATIONS = ['Friend', 'Relative', 'Client', 'Other'];

export default function CelebrationsTab() {
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Contact Form State
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('Friend');
  const [birthday, setBirthday] = useState('');
  const [anniversary, setAnniversary] = useState('');

  // Load celebrations list
  useEffect(() => {

    const q = query(collection(db, 'celebrations'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setContacts(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to stream celebrations:', err);
      toast.error('Failed to load celebrations list');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Native Web Contact Picker integration
  const handlePickContact = async () => {
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      toast.error('Web Contact Picker is not supported in this browser. Please type details manually.');
      return;
    }

    try {
      const props = ['name', 'tel'];
      const picked = await navigator.contacts.select(props, { multiple: false });
      if (picked && picked.length > 0) {
        const contact = picked[0];
        const selectedName = contact.name && contact.name[0] ? contact.name[0] : '';
        const selectedTel = contact.tel && contact.tel[0] ? contact.tel[0] : '';
        
        setName(selectedName);
        // Normalize phone number (digits only, trim spaces/hyphens)
        const cleanedPhone = selectedTel.replace(/\D/g, '');
        // If it starts with country code, keep standard 10 or 12 digit format
        setPhone(cleanedPhone);
        
        toast.success(`Imported: ${selectedName}`);
      }
    } catch (err) {
      console.warn('Contact selection cancelled or failed:', err);
    }
  };



  // Save / Update Contact Doc
  const handleSubmitContact = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !birthday) {
      toast.error('Name, Phone, and Birthday are required');
      return;
    }

    setSavingContact(true);
    const cleanedPhone = phone.replace(/\D/g, '');

    const contactData = {
      name: name.trim(),
      phone: cleanedPhone,
      relation,
      birthday,
      anniversary: anniversary || null,
      updatedAt: new Date()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'celebrations', editingId), contactData);
        toast.success('Contact updated successfully!');
        setEditingId(null);
      } else {
        contactData.createdAt = new Date();
        contactData.lastSentBirthdayYear = null;
        contactData.lastSentAnniversaryYear = null;
        await addDoc(collection(db, 'celebrations'), contactData);
        toast.success('Contact added successfully!');
      }

      // Reset form fields
      setName('');
      setPhone('');
      setRelation('Friend');
      setBirthday('');
      setAnniversary('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  const handleEdit = (c) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setRelation(c.relation || 'Friend');
    setBirthday(c.birthday);
    setAnniversary(c.anniversary || '');
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      try {
        await deleteDoc(doc(db, 'celebrations', id));
        toast.success('Contact deleted successfully');
      } catch (err) {
        console.error(err);
        toast.error('Failed to delete contact');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setRelation('Friend');
    setBirthday('');
    setAnniversary('');
  };

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    (c.relation && c.relation.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getOccasionText = (c) => {
    const today = new Date();
    const currentMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const bMonthDay = c.birthday ? c.birthday.substring(5) : '';
    const aMonthDay = c.anniversary ? c.anniversary.substring(5) : '';

    if (bMonthDay === currentMonthDay && aMonthDay === currentMonthDay) {
      return '🎂 Birthday & 💑 Anniversary Today!';
    } else if (bMonthDay === currentMonthDay) {
      return '🎂 Birthday Today!';
    } else if (aMonthDay === currentMonthDay) {
      return '💑 Anniversary Today!';
    }
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-2 md:p-3">
      {/* Add / Edit Contact Panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between border-b pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
            <UserPlus className="h-4 w-4 text-orange-500" />
            {editingId ? 'Edit Celebrator' : 'Add New Celebrator'}
          </h3>
          {'contacts' in navigator && 'ContactsManager' in window && !editingId && (
            <button
              type="button"
              onClick={handlePickContact}
              className="flex items-center gap-1 rounded bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-600 border border-orange-200 transition-all hover:bg-orange-100 cursor-pointer"
            >
              <BookOpen className="h-3 w-3" />
              Import from Device
            </button>
          )}
        </div>

        <form onSubmit={handleSubmitContact} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
          <div>
            <label htmlFor="celebratorName" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <User className="h-3 w-3" />
              Full Name
            </label>
            <input
              id="celebratorName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g., John Doe"
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label htmlFor="celebratorPhone" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <Phone className="h-3 w-3" />
              Phone Number
            </label>
            <input
              id="celebratorPhone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="E.g., 919876543210"
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label htmlFor="celebratorRelation" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Relationship
            </label>
            <select
              id="celebratorRelation"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-400"
            >
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="celebratorBirthday" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <Calendar className="h-3 w-3" />
                Birthday
              </label>
              <input
                id="celebratorBirthday"
                type="date"
                required
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label htmlFor="celebratorAnniversary" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <Calendar className="h-3 w-3" />
                Anniversary
              </label>
              <input
                id="celebratorAnniversary"
                type="date"
                value={anniversary}
                onChange={(e) => setAnniversary(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          <div className="md:col-span-4 flex justify-end gap-2 pt-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-xs font-bold text-gray-600 transition-all hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={savingContact}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-orange-600 bg-orange-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-orange-600 disabled:opacity-50"
            >
              {editingId ? 'Update Celebrator' : 'Add Celebrator'}
            </button>
          </div>
        </form>
      </div>

      {/* Celebrators List */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="p-3.5 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
            <Gift className="h-4 w-4 text-orange-500" />
            Celebrations Directory ({filteredContacts.length})
          </h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or relation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64 rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Relation</th>
                <th className="px-4 py-2">Birthday</th>
                <th className="px-4 py-2">Anniversary</th>
                <th className="px-4 py-2">Special Occasion</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-gray-400 italic">No celebrations found.</td>
                </tr>
              ) : (
                filteredContacts.map((c) => {
                  const occasionText = getOccasionText(c);
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-bold text-gray-800">{c.name}</td>
                      <td className="px-4 py-2 font-medium text-gray-600">{c.phone}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.relation === 'Client' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          c.relation === 'Friend' ? 'bg-green-50 text-green-600 border border-green-100' :
                          c.relation === 'Relative' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                          'bg-gray-50 text-gray-600 border border-gray-100'
                        }`}>
                          {c.relation || 'Friend'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-500">
                        {c.birthday ? new Date(c.birthday).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '-'}
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-500">
                        {c.anniversary ? new Date(c.anniversary).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {occasionText && (
                          <span className="inline-block bg-orange-50 border border-orange-100 text-orange-600 text-[10.5px] font-bold px-2 py-0.5 rounded animate-pulse">
                            {occasionText}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right space-x-1.5">
                        <button
                          onClick={() => handleEdit(c)}
                          className="text-blue-500 hover:text-blue-700 inline-flex items-center justify-center p-1 rounded hover:bg-blue-50 transition-all cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-red-500 hover:text-red-700 inline-flex items-center justify-center p-1 rounded hover:bg-red-50 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
