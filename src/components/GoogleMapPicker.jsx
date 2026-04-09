import { useEffect, useMemo, useRef, useState } from 'react';

let mapsScriptPromise = null;

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
  const placesServiceRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState(initialAddress || '');
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const requestOptions = useMemo(() => ({ types: ['geocode'] }), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let isActive = true;

    const initializePlaces = async () => {
      try {
        await loadGoogleMapsScript(apiKey);
        if (!isActive) return;

        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
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
    if (!autocompleteServiceRef.current) return;

    const timer = setTimeout(() => {
      setIsSearching(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: searchTerm,
          ...requestOptions,
        },
        (results, status) => {
          setIsSearching(false);
          if (status !== 'OK' || !results) {
            setPredictions([]);
            return;
          }
          setPredictions(results.slice(0, 6));
        }
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [requestOptions, searchTerm]);

  const handleSelectPrediction = (prediction) => {
    if (!placesServiceRef.current) return;

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'formatted_address', 'name'],
      },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) {
          setError('Unable to fetch selected place details.');
          return;
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || prediction.description || '';
        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

        setSearchTerm(address);
        setPredictions([]);
        setError('');
        onChangeRef.current?.({ lat, lng, address, mapLink });
      }
    );
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
            {!isSearching && predictions.map((item) => (
              <button
                type="button"
                key={item.place_id}
                onClick={() => handleSelectPrediction(item)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
              >
                {item.description}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500">Start typing and select the exact location from suggestions.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
