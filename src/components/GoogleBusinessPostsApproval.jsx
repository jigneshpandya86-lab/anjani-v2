import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot,
  doc, deleteDoc, addDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase-config';
import {
  Globe, Copy, CheckCircle, AlertCircle, Loader, Trash2,
  RefreshCw, Plus, X, Image, Download, ClipboardCheck, ExternalLink
} from 'lucide-react';

const COPY_RESET_MS = 2500;

const GoogleBusinessPostsApproval = () => {
  const [pendingPosts, setPendingPosts] = useState([]);
  const [postedPosts, setPostedPosts] = useState([]);
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [manualPostModal, setManualPostModal] = useState(false);
  const [manualPostText, setManualPostText] = useState('');
  const [manualPostLoading, setManualPostLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'googleBusinessPosts'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      setPendingPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => showToast('Error loading posts: ' + err.message, 'error'));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'googleBusinessPosts'), where('status', '==', 'posted'));
    return onSnapshot(q, (snap) => {
      setPostedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const copyToClipboard = async (text, postId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(postId);
      showToast('Post text copied! Paste it on Google Business Profile.', 'success');
      setTimeout(() => setCopiedId(null), COPY_RESET_MS);
    } catch {
      // fallback for older browsers / WebView
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(postId);
      showToast('Post text copied!', 'success');
      setTimeout(() => setCopiedId(null), COPY_RESET_MS);
    }
  };

  const markAsPosted = async (postId) => {
    setLoading(prev => ({ ...prev, [postId]: 'posting' }));
    try {
      await updateDoc(doc(db, 'googleBusinessPosts', postId), {
        status: 'posted',
        postedAt: serverTimestamp(),
        error: null,
      });
      showToast('Marked as posted!', 'success');
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    } finally {
      setLoading(prev => ({ ...prev, [postId]: null }));
    }
  };

  const deletePost = async (postId) => {
    setLoading(prev => ({ ...prev, [postId]: 'deleting' }));
    try {
      await deleteDoc(doc(db, 'googleBusinessPosts', postId));
      showToast('Post deleted.', 'info');
    } catch {
      showToast('Failed to delete post.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, [postId]: null }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image must be under 10 MB.', 'error');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createManualPost = async () => {
    if (!manualPostText.trim()) {
      showToast('Please enter some text for your post.', 'error');
      return;
    }
    if (manualPostText.trim().length > 1500) {
      showToast('Post is too long. Maximum 1500 characters.', 'error');
      return;
    }

    setManualPostLoading(true);
    try {
      let imageUrl = null;

      // Save Firestore doc first to get an ID
      const docRef = await addDoc(collection(db, 'googleBusinessPosts'), {
        summary: manualPostText.trim(),
        marketingType: 'manual',
        keywords: [],
        hashtags: [],
        status: 'pending',
        createdAt: serverTimestamp(),
        approvedAt: null,
        postedAt: null,
        postId: null,
        error: null,
        isManual: true,
        imageUrl: null,
      });

      // Upload image after we have a doc ID
      if (imageFile) {
        const storageRef = ref(storage, `business-posts/${docRef.id}/image`);
        const snap = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snap.ref);
        await updateDoc(docRef, { imageUrl });
      }

      showToast('Post created successfully!', 'success');
      setManualPostText('');
      removeImage();
      setManualPostModal(false);
      setActiveTab('pending');
    } catch (e) {
      showToast('Failed to create post: ' + e.message, 'error');
    } finally {
      setManualPostLoading(false);
    }
  };

  // ─── Post Card ────────────────────────────────────────────────────────────
  const PostCard = ({ post, isPosted = false }) => {
    const isCopied = copiedId === post.id;

    const typeColors = {
      serviceHighlight: 'from-blue-500 to-blue-600',
      customerBenefit:  'from-green-500 to-green-600',
      promotion:        'from-orange-500 to-orange-600',
      sustainability:   'from-emerald-500 to-emerald-600',
      callToAction:     'from-red-500 to-red-600',
      manual:           'from-purple-500 to-purple-600',
    };
    const typeLabels = {
      serviceHighlight: 'Service Highlight',
      customerBenefit:  'Customer Benefit',
      promotion:        'Promotion',
      sustainability:   'Sustainability',
      callToAction:     'Call to Action',
      manual:           'Manual Post',
    };

    const gradient = typeColors[post.marketingType] || 'from-gray-500 to-gray-600';

    return (
      <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${
        isPosted ? 'border-green-400 opacity-80' : 'border-blue-500'
      }`}>
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className={`bg-gradient-to-r ${gradient} text-white text-xs font-bold px-3 py-1 rounded-full`}>
            {typeLabels[post.marketingType] || 'Post'}
          </span>
          <div className="flex items-center gap-2">
            {isPosted && (
              <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                <CheckCircle size={14} /> Posted
              </span>
            )}
            <span className="text-xs text-gray-400">
              {post.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || ''}
            </span>
          </div>
        </div>

        {/* Image (if any) */}
        {post.imageUrl && (
          <div className="mx-4 mb-3 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 relative group">
            <img
              src={post.imageUrl}
              alt="Post visual"
              className="w-full object-cover max-h-52"
            />
            <a
              href={post.imageUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="absolute top-2 right-2 bg-black/50 text-white rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Download image"
            >
              <Download size={14} />
            </a>
          </div>
        )}

        {/* Full post text — always fully visible, easy to select */}
        <div className="mx-4 mb-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 select-all cursor-text">
            <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {post.summary}
            </p>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="text-[10px] text-gray-400">{post.summary?.length || 0} characters</span>
            <button
              onClick={() => copyToClipboard(post.summary, post.id)}
              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                isCopied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              {isCopied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
              {isCopied ? 'Copied!' : 'Copy Text'}
            </button>
          </div>
        </div>

        {/* Keywords / Hashtags */}
        {(post.keywords?.length > 0 || post.hashtags?.length > 0) && (
          <div className="mx-4 mb-3 space-y-1.5">
            {post.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {post.keywords.map((k, i) => (
                  <span key={i} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{k}</span>
                ))}
              </div>
            )}
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {post.hashtags.map((h, i) => (
                  <span key={i} className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{h}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error (clear display) */}
        {post.error && (
          <div className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-700">Auto-post failed — copy the text above and post manually.</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isPosted && (
          <div className="px-4 pb-4 flex gap-2">
            {/* PRIMARY: Copy text */}
            <button
              onClick={() => copyToClipboard(post.summary, post.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm transition-all ${
                isCopied
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
              {isCopied ? 'Copied!' : 'Copy Post'}
            </button>

            {/* Open Google Business */}
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center px-3 py-2.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
              title="Open Google Business Profile"
            >
              <ExternalLink size={16} />
            </a>

            {/* Mark as Posted (done manually) */}
            <button
              onClick={() => markAsPosted(post.id)}
              disabled={!!loading[post.id]}
              title="Mark as posted (after you paste it manually)"
              className="flex items-center justify-center px-3 py-2.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 disabled:opacity-50"
            >
              {loading[post.id] === 'posting'
                ? <Loader size={16} className="animate-spin" />
                : <CheckCircle size={16} />}
            </button>

            {/* Delete */}
            <button
              onClick={() => deletePost(post.id)}
              disabled={!!loading[post.id]}
              title="Delete post"
              className="flex items-center justify-center px-3 py-2.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200 disabled:opacity-50"
            >
              {loading[post.id] === 'deleting'
                ? <Loader size={16} className="animate-spin" />
                : <Trash2 size={16} />}
            </button>
          </div>
        )}

        {isPosted && post.postedAt && (
          <div className="px-4 pb-3 text-[11px] text-gray-400">
            Posted on {post.postedAt?.toDate?.()?.toLocaleString('en-IN') || ''}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-blue-600 rounded-xl p-2.5">
            <Globe size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800">Google Business Posts</h1>
            <p className="text-xs text-gray-500">Copy posts → paste on Google Business Profile</p>
          </div>
        </div>

        {/* Info banner — Google API not available */}
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <strong>Auto-posting is unavailable</strong> (Google My Business API not enabled).
            Copy the post text using the <strong>Copy Post</strong> button and paste it manually on{' '}
            <a href="https://business.google.com" target="_blank" rel="noreferrer" className="underline font-semibold">business.google.com</a>.
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
            toast.type === 'error'   ? 'bg-red-100 text-red-800 border border-red-200' :
            toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
                                       'bg-blue-100 text-blue-800 border border-blue-200'
          }`}>
            {toast.type === 'error'   && <AlertCircle size={16} className="text-red-500" />}
            {toast.type === 'success' && <CheckCircle size={16} className="text-green-600" />}
            {toast.message}
          </div>
        )}

        {/* Tabs + Create */}
        <div className="flex items-center justify-between mb-4 border-b border-gray-200">
          <div className="flex gap-1">
            {['pending', 'posted'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? tab === 'pending'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'pending' ? `Pending (${pendingPosts.length})` : `Posted (${postedPosts.length})`}
              </button>
            ))}
          </div>
          <button
            onClick={() => setManualPostModal(true)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm py-2 px-3 rounded-lg transition-all"
          >
            <Plus size={16} /> Create Post
          </button>
        </div>

        {/* Post lists */}
        <div className="space-y-4">
          {activeTab === 'pending' && (
            pendingPosts.length === 0
              ? <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
                  <Globe size={40} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm font-medium">No pending posts</p>
                  <p className="text-gray-400 text-xs mt-1">Auto-posts generate every Monday · Or tap Create Post</p>
                </div>
              : pendingPosts.map(p => <PostCard key={p.id} post={p} isPosted={false} />)
          )}
          {activeTab === 'posted' && (
            postedPosts.length === 0
              ? <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
                  <CheckCircle size={40} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm font-medium">No posted posts yet</p>
                </div>
              : postedPosts.map(p => <PostCard key={p.id} post={p} isPosted={true} />)
          )}
        </div>
      </div>

      {/* ── Create Post Modal ── */}
      {manualPostModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-3"
          onClick={() => setManualPostModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-800">Create Post</h2>
              <button onClick={() => setManualPostModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Post text */}
              <div>
                <label htmlFor="modal-post-content" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Post Content
                </label>
                <textarea
                  id="modal-post-content"
                  value={manualPostText}
                  onChange={e => setManualPostText(e.target.value)}
                  placeholder="Write your marketing post here… (max 1500 characters)"
                  className="w-full h-36 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none leading-relaxed"
                  maxLength={1500}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">{manualPostText.length} / 1500</span>
                  {manualPostText.length > 1400 && (
                    <span className="text-[10px] text-orange-600 font-semibold">Approaching limit</span>
                  )}
                </div>
              </div>

              {/* Image picker */}
              <div>
                <label htmlFor="modal-post-image" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Attach Image (optional)
                </label>
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={imagePreview} alt="Preview" className="w-full object-cover max-h-48" />
                    <button
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center gap-2 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    <Image size={28} />
                    <span className="text-sm font-medium">Tap to add photo</span>
                    <span className="text-xs">JPG, PNG, WEBP · Max 10 MB</span>
                  </button>
                )}
                <input
                  id="modal-post-image"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-blue-700">
                  <strong>Tip:</strong> Include keywords like "water delivery Vadodara" and hashtags like #PureWater #AnjaniWater for better reach.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setManualPostModal(false); removeImage(); }}
                disabled={manualPostLoading}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createManualPost}
                disabled={manualPostLoading || !manualPostText.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {manualPostLoading
                  ? <><Loader size={16} className="animate-spin" /> Saving…</>
                  : <><Plus size={16} /> Create Post</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleBusinessPostsApproval;
