import { useState } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import { Shield, AlertCircle, Loader2 } from 'lucide-react';
import SearchBar from './components/SearchBar';
import SafetyReport from './components/SafetyReport';
import toast, { Toaster } from 'react-hot-toast';

function App() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (searchTerm) => {
    setLoading(true);
    setHasSearched(true);
    setSelectedLocation(null);

    try {
      const q = query(
        collection(db, 'locations'),
        where('search_keys', 'array-contains', searchTerm.toLowerCase()),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setSelectedLocation(querySnapshot.docs[0].data());
        toast.success('Location found!');
      } else {
        toast.error('Location not found. Try "Vadodara" or "390019".');
      }
    } catch (error) {
      console.error('Error fetching location:', error);
      toast.error('Failed to fetch safety data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <Toaster position="top-center" />
      
      {/* Navigation / Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedLocation(null); setHasSearched(false); }}>
            <div className="bg-indigo-600 p-2 rounded-xl">
              <Shield className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Safe For Me</h1>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">How it works</a>
            <a href="#" className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Emergency Guide</a>
            <button className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-sm">
              Community Login
            </button>
          </nav>
        </div>
      </header>

      <main className="py-12 md:py-20">
        {/* Hero Section (only show if no location selected) */}
        {!selectedLocation && !loading && (
          <div className="max-w-4xl mx-auto text-center px-4 mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold mb-6">
              <Shield size={16} />
              Verified Safety Data
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 leading-[1.1]">
              Know before you go. <br />
              <span className="text-indigo-600">Travel with confidence.</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Real-time safety reports, crime statistics, and emergency contact details for neighborhoods across India.
            </p>
          </div>
        )}

        <SearchBar onSearch={handleSearch} />

        {loading && (
          <div className="flex flex-col items-center justify-center mt-20 gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
            <p className="text-slate-500 font-medium animate-pulse">Analyzing safety data...</p>
          </div>
        )}

        {selectedLocation && !loading && (
          <SafetyReport location={selectedLocation} />
        )}

        {hasSearched && !selectedLocation && !loading && (
          <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
            <div className="bg-amber-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-amber-600" size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">Location Not Found</h3>
            <p className="text-slate-500 mb-6 leading-relaxed">
              We haven't indexed safety data for this area yet. Try searching for "Vadodara" to see a live sample report.
            </p>
            <button 
              onClick={() => handleSearch('vadodara')}
              className="text-indigo-600 font-bold hover:underline"
            >
              Search Vadodara instead
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 grayscale opacity-50">
            <Shield size={20} />
            <span className="font-bold">Safe For Me</span>
          </div>
          <p className="text-slate-400 text-sm">
            © 2026 Safe For Me. All rights reserved. Designed for personal safety.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-sm font-medium">Privacy</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-sm font-medium">Terms</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-sm font-medium">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
