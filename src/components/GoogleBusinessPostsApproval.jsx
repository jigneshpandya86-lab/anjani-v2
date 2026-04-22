import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-config';
import { Globe, Copy, CheckCircle, AlertCircle, Loader, Trash2, RefreshCw } from 'lucide-react';

const GoogleBusinessPostsApproval = () => {
    const [pendingPosts, setPendingPosts] = useState([]);
    const [postedPosts, setPostedPosts] = useState([]);
    const [loading, setLoading] = useState({});
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('pending');

    // Subscribe to pending posts
    useEffect(() => {
        const q = query(
            collection(db, 'googleBusinessPosts'),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            showToast('Error loading pending posts', 'error');
        });

        return unsubscribe;
    }, []);

    // Subscribe to posted posts
    useEffect(() => {
        const q = query(
            collection(db, 'googleBusinessPosts'),
            where('status', '==', 'posted'),
            orderBy('postedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPostedPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
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
            const response = await approvePost({ documentId: postId, shouldPost: true });
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
        } catch (error) {
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
        } catch (error) {
            showToast('Failed to skip post', 'error');
        } finally {
            setLoading(prev => ({ ...prev, [postId]: null }));
        }
    };

    const PostCard = ({ post, isPosted = false }) => {
        const marketingTypeColors = {
            serviceHighlight: 'from-blue-500 to-blue-600',
            customerBenefit: 'from-green-500 to-green-600',
            promotion: 'from-orange-500 to-orange-600',
            sustainability: 'from-emerald-500 to-emerald-600',
            callToAction: 'from-red-500 to-red-600'
        };

        const marketingTypeLabels = {
            serviceHighlight: 'Service Highlight',
            customerBenefit: 'Customer Benefit',
            promotion: 'Promotion',
            sustainability: 'Sustainability',
            callToAction: 'Call to Action'
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

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-gray-200">
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
        </div>
    );
};

export default GoogleBusinessPostsApproval;
