import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-config';
import { Globe, Copy, CheckCircle, AlertCircle, Loader, Trash2, RefreshCw, Plus, X } from 'lucide-react';

const GoogleBusinessPostsApproval = () => {
    const [pendingPosts, setPendingPosts] = useState([]);
    const [postedPosts, setPostedPosts] = useState([]);
    const [loading, setLoading] = useState({});
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('pending');
    const [manualPostModal, setManualPostModal] = useState(false);
    const [manualPostText, setManualPostText] = useState('');
    const [manualPostLoading, setManualPostLoading] = useState(false);

    // Subscribe to pending posts
    useEffect(() => {
        const q = query(
            collection(db, 'googleBusinessPosts'),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log('Pending posts updated:', posts.length, posts);
            setPendingPosts(posts);
        }, (_error) => {
            console.error('Firestore subscription error:', _error);
            showToast('Error loading pending posts: ' + _error.message, 'error');
        });

        return unsubscribe;
    }, []);

    // Subscribe to posted posts
    useEffect(() => {
        const q = query(
            collection(db, 'googleBusinessPosts'),
            where('status', '==', 'posted')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPostedPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (_error) => {
            // Silently fail for posted posts
        });

        return unsubscribe;
    }, []);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    const approveAndPost = async (postId) => {
        setLoading(prev => ({ ...prev, [postId]: 'posting' }));
        try {
            const functions = getFunctions();
            const approvePost = httpsCallable(functions, 'approveAndPostGoogleBusinessUpdate');
            await approvePost({ documentId: postId, shouldPost: true });
            showToast('Post published successfully! 🎉', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to post. Please try again.', 'error');
        } finally {
            setLoading(prev => ({ ...prev, [postId]: null }));
        }
    };

    const regeneratePost = async (postId) => {
        setLoading(prev => ({ ...prev, [postId]: 'regenerating' }));
        try {
            // Delete current post and trigger regeneration
            const docRef = doc(db, 'googleBusinessPosts', postId);
            await deleteDoc(docRef);
            showToast('Post deleted. New one will be generated on Monday.', 'info');
        } catch (_error) {
            showToast('Failed to regenerate post', 'error');
        } finally {
            setLoading(prev => ({ ...prev, [postId]: null }));
        }
    };

    const skipPost = async (postId) => {
        setLoading(prev => ({ ...prev, [postId]: 'skipping' }));
        try {
            const functions = getFunctions();
            const approvePost = httpsCallable(functions, 'approveAndPostGoogleBusinessUpdate');
            await approvePost({ documentId: postId, shouldPost: false });
            showToast('Post skipped', 'info');
        } catch (_error) {
            showToast('Failed to skip post', 'error');
        } finally {
            setLoading(prev => ({ ...prev, [postId]: null }));
        }
    };

    const createManualPost = async () => {
        if (!manualPostText.trim()) {
            showToast('Please enter some text for your post', 'error');
            return;
        }

        if (manualPostText.trim().length > 1500) {
            showToast('Post is too long. Maximum 1500 characters.', 'error');
            return;
        }

        setManualPostLoading(true);
        try {
            // Create post in Firestore with 'pending' status
            await addDoc(collection(db, 'googleBusinessPosts'), {
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
                isManual: true
            });

            showToast('✅ Post created! Refreshing...', 'success');
            setManualPostText('');
            setManualPostModal(false);

            // Small delay to ensure Firestore writes and subscription updates
            setTimeout(() => {
                setActiveTab('pending');
            }, 500);
        } catch (_error) {
            console.error('Error creating post:', _error);
            showToast('Failed to create post: ' + _error.message, 'error');
        } finally {
            setManualPostLoading(false);
        }
    };

    const PostCard = ({ post, isPosted = false }) => {
        const marketingTypeColors = {
            serviceHighlight: 'from-blue-500 to-blue-600',
            customerBenefit: 'from-green-500 to-green-600',
            promotion: 'from-orange-500 to-orange-600',
            sustainability: 'from-emerald-500 to-emerald-600',
            callToAction: 'from-red-500 to-red-600',
            manual: 'from-purple-500 to-purple-600'
        };

        const marketingTypeLabels = {
            serviceHighlight: 'Service Highlight',
            customerBenefit: 'Customer Benefit',
            promotion: 'Promotion',
            sustainability: 'Sustainability',
            callToAction: 'Call to Action',
            manual: 'Manual Post'
        };

        const gradientClass = marketingTypeColors[post.marketingType] || 'from-gray-500 to-gray-600';

        return (
            <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-l-4 border-blue-500">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`bg-gradient-to-r ${gradientClass} px-3 py-1 rounded-full text-white text-sm font-medium`}>
                            {marketingTypeLabels[post.marketingType] || 'Post'}
                        </div>
                        {isPosted && (
                            <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle size={18} />
                                <span className="text-sm font-medium">Posted</span>
                            </div>
                        )}
                    </div>
                    <span className="text-xs text-gray-500">
                        {post.createdAt?.toDate?.()?.toLocaleDateString() || 'Date unknown'}
                    </span>
                </div>

                {/* Post Content */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                    <p className="text-gray-800 leading-relaxed text-base">
                        {post.summary}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-gray-500">
                            {post.summary?.length || 0} characters
                        </span>
                        {!isPosted && (
                            <button
                                onClick={() => copyToClipboard(post.summary)}
                                className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs font-medium"
                            >
                                <Copy size={14} /> Copy
                            </button>
                        )}
                    </div>
                </div>

                {/* Keywords & Hashtags */}
                {(post.keywords?.length > 0 || post.hashtags?.length > 0) && (
                    <div className="mb-4">
                        {post.keywords?.length > 0 && (
                            <div className="mb-2">
                                <p className="text-xs font-semibold text-gray-600 mb-1">Keywords:</p>
                                <div className="flex flex-wrap gap-1">
                                    {post.keywords.map((keyword, idx) => (
                                        <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {post.hashtags?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-600 mb-1">Hashtags:</p>
                                <div className="flex flex-wrap gap-1">
                                    {post.hashtags.map((tag, idx) => (
                                        <span key={idx} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {post.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                        <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-red-800">Failed to post</p>
                            <p className="text-xs text-red-700 mt-1">{post.error}</p>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                {!isPosted && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => approveAndPost(post.id)}
                            disabled={loading[post.id] !== null}
                            className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            {loading[post.id] === 'posting' ? (
                                <>
                                    <Loader size={18} className="animate-spin" />
                                    Publishing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={18} />
                                    Approve & Post
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => regeneratePost(post.id)}
                            disabled={loading[post.id] !== null}
                            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            {loading[post.id] === 'regenerating' ? (
                                <Loader size={18} className="animate-spin" />
                            ) : (
                                <RefreshCw size={18} />
                            )}
                        </button>
                        <button
                            onClick={() => skipPost(post.id)}
                            disabled={loading[post.id] !== null}
                            className="bg-gray-300 hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            {loading[post.id] === 'skipping' ? (
                                <Loader size={18} className="animate-spin" />
                            ) : (
                                <Trash2 size={18} />
                            )}
                        </button>
                    </div>
                )}

                {isPosted && post.postedAt && (
                    <div className="text-xs text-gray-600">
                        <p>Posted on {post.postedAt?.toDate?.()?.toLocaleString() || 'Unknown'}</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-3">
                        <Globe size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Google Business Posts</h1>
                        <p className="text-gray-600">Review and publish marketing posts</p>
                    </div>
                </div>

                {/* Toast Notification */}
                {toast && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 animate-slide-in ${
                        toast.type === 'error' ? 'bg-red-100 border border-red-300' :
                        toast.type === 'success' ? 'bg-green-100 border border-green-300' :
                        'bg-blue-100 border border-blue-300'
                    }`}>
                        {toast.type === 'error' && <AlertCircle size={20} className="text-red-600" />}
                        {toast.type === 'success' && <CheckCircle size={20} className="text-green-600" />}
                        <p className={`text-sm font-medium ${
                            toast.type === 'error' ? 'text-red-800' :
                            toast.type === 'success' ? 'text-green-800' :
                            'text-blue-800'
                        }`}>
                            {toast.message}
                        </p>
                    </div>
                )}

                {/* Tabs & Create Button */}
                <div className="flex gap-4 mb-6 border-b border-gray-200 items-center justify-between">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                                activeTab === 'pending'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            Pending ({pendingPosts.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('posted')}
                            className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                                activeTab === 'posted'
                                    ? 'border-green-500 text-green-600'
                                    : 'border-transparent text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            Posted ({postedPosts.length})
                        </button>
                    </div>
                    <button
                        onClick={() => setManualPostModal(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-all"
                    >
                        <Plus size={18} /> Create Post
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'pending' && (
                    <div className="space-y-4">
                        {pendingPosts.length === 0 ? (
                            <div className="bg-white rounded-lg p-8 text-center border border-gray-200">
                                <Globe size={48} className="text-gray-400 mx-auto mb-3" />
                                <p className="text-gray-600 font-medium">No pending posts</p>
                                <p className="text-gray-500 text-sm mt-1">Posts will be generated every Monday at 8 AM UTC</p>
                            </div>
                        ) : (
                            pendingPosts.map(post => (
                                <PostCard key={post.id} post={post} isPosted={false} />
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'posted' && (
                    <div className="space-y-4">
                        {postedPosts.length === 0 ? (
                            <div className="bg-white rounded-lg p-8 text-center border border-gray-200">
                                <CheckCircle size={48} className="text-gray-400 mx-auto mb-3" />
                                <p className="text-gray-600 font-medium">No posted posts yet</p>
                                <p className="text-gray-500 text-sm mt-1">Posts will appear here after approval</p>
                            </div>
                        ) : (
                            postedPosts.map(post => (
                                <PostCard key={post.id} post={post} isPosted={true} />
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Create Manual Post Modal */}
            {manualPostModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Create Manual Post</h2>
                            <button
                                onClick={() => setManualPostModal(false)}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label htmlFor="post-content" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Post Content
                                </label>
                                <textarea
                                    id="post-content"
                                    value={manualPostText}
                                    onChange={(e) => setManualPostText(e.target.value)}
                                    placeholder="Write your marketing post here (max 1500 characters)..."
                                    className="w-full h-32 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                    maxLength={1500}
                                />
                                <div className="mt-2 flex justify-between items-center">
                                    <p className="text-xs text-gray-500">
                                        {manualPostText.length} / 1500 characters
                                    </p>
                                    {manualPostText.length > 1400 && (
                                        <p className="text-xs text-orange-600 font-medium">
                                            Approaching limit
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Tip:</strong> Include keywords like "water delivery Vadodara", "pure drinking water" and hashtags like #PureWater #VadodaraWater for better reach.
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
                            <button
                                onClick={() => setManualPostModal(false)}
                                disabled={manualPostLoading}
                                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createManualPost}
                                disabled={manualPostLoading || !manualPostText.trim()}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {manualPostLoading ? (
                                    <>
                                        <Loader size={18} className="animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={18} />
                                        Create Post
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GoogleBusinessPostsApproval;
