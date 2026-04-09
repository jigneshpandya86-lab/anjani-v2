import { useEffect, useRef, useState } from 'react';

let mapsScriptPromise = null;
const VADODARA_RESTRICTION = {
  north: 22.45,
  south: 22.2,
  east: 73.3,
  west: 72.95,
};
const VADODARA_ORIGIN = { lat: 22.3072, lng: 73.1812 };

const loadGoogleMapsScript = (apiKey) => {
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY in .env.'));
  }

  if (window.google?.maps?.places) return Promise.resolve(window.google.maps);

  if (!mapsScriptPromise) {
    mapsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-loader="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.maps));
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'true';
      script.onload = () => {
        if (!window.google?.maps?.places) {
          reject(new Error('Google Places is not available after script load.'));
          return;
        }
        resolve(window.google.maps);
      };
      script.onerror = () => reject(new Error('Failed to load Google Maps script.'));
      document.head.appendChild(script);
    });
  }

  return mapsScriptPromise;
};

export default function GoogleMapPicker({ initialAddress = '', onChange }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const onChangeRef = useRef(onChange);
  const sessionTokenRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState(initialAddress || '');
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let isActive = true;

    const initializePlaces = async () => {
      try {
        await loadGoogleMapsScript(apiKey);
        if (!isActive) return;

        if (!window.google.maps.places.AutocompleteSuggestion) {
          setError('Places API (New) is not enabled for this key/project.');
          return;
        }
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      } catch (err) {
        if (!isActive) return;
        setError(err.message || 'Unable to load location search.');
      }
    };

    initializePlaces();

    return () => {
      isActive = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!searchTerm.trim()) return;
    if (!window.google?.maps?.places?.AutocompleteSuggestion) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }

        const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: searchTerm,
          sessionToken: sessionTokenRef.current,
          locationRestriction: VADODARA_RESTRICTION,
          origin: VADODARA_ORIGIN,
          includedRegionCodes: ['in'],
        });

        setPredictions(Array.isArray(suggestions) ? suggestions.slice(0, 6) : []);
        setError('');
      } catch (err) {
        setPredictions([]);
        setError(err?.message || 'Location suggestions failed to load.');
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectPrediction = async (suggestion) => {
    try {
      const place = suggestion?.placePrediction?.toPlace?.();
      if (!place) {
        setError('Unable to fetch selected place details.');
        return;
      }

      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });

      const lat = place.location?.lat?.();
      const lng = place.location?.lng?.();

      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        setError('Selected place does not include coordinates.');
        return;
      }

      const address = place.formattedAddress || suggestion?.placePrediction?.text?.text || '';
      const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

      setSearchTerm(address);
      setPredictions([]);
      setError('');
      onChangeRef.current?.({ lat, lng, address, mapLink });

      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    } catch (err) {
      setError(err?.message || 'Unable to fetch selected place details.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            const nextValue = e.target.value;
            setSearchTerm(nextValue);
            if (!nextValue.trim()) setPredictions([]);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amz-orange focus:border-amz-orange"
          placeholder="Type and select a place"
        />
        {(isSearching || predictions.length > 0) && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {isSearching && <p className="px-3 py-2 text-xs text-gray-500">Searching...</p>}
            {!isSearching && predictions.map((item, index) => (
              <button
                type="button"
                key={item?.placePrediction?.placeId || index}
                onClick={() => handleSelectPrediction(item)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
              >
                {item?.placePrediction?.text?.text || 'Unknown location'}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500">Start typing and select a location (restricted to Vadodara, Gujarat).</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
