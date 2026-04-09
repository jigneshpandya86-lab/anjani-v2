import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';

const FALLBACK_CENTER = { lat: 28.6139, lng: 77.209 };
let mapsScriptPromise = null;

const loadGoogleMapsScript = (apiKey) => {
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY in .env.'));
  }

  if (window.google?.maps) return Promise.resolve(window.google.maps);

  if (!mapsScriptPromise) {
    mapsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-loader="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.maps));
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'true';
      script.onload = () => {
        if (!window.google?.maps) {
          reject(new Error('Google Maps is not available after script load.'));
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

export default function GoogleMapPicker({ initialLat, initialLng, initialAddress = '', onChange }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const [error, setError] = useState('');
  const [address, setAddress] = useState(initialAddress || '');

  const initialCenter = useMemo(() => {
    if (Number.isFinite(Number(initialLat)) && Number.isFinite(Number(initialLng))) {
      return { lat: Number(initialLat), lng: Number(initialLng) };
    }
    return FALLBACK_CENTER;
  }, [initialLat, initialLng]);

  useEffect(() => {
    let isActive = true;

    const initializeMap = async () => {
      try {
        await loadGoogleMapsScript(apiKey);
        if (!isActive || !mapElementRef.current) return;

        const center = initialCenter;
        const map = new window.google.maps.Map(mapElementRef.current, {
          center,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        const marker = new window.google.maps.Marker({
          position: center,
          map,
          draggable: true,
          title: 'Delivery location',
        });

        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new window.google.maps.Geocoder();

        const updateFromPosition = (pos) => {
          const lat = pos.lat();
          const lng = pos.lng();
          const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

          geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
            const nextAddress = status === 'OK' && results?.[0]?.formatted_address
              ? results[0].formatted_address
              : '';
            if (!isActive) return;
            setAddress(nextAddress);
            onChange?.({ lat, lng, address: nextAddress, mapLink });
          });
        };

        marker.addListener('dragend', (event) => updateFromPosition(event.latLng));
        map.addListener('click', (event) => {
          marker.setPosition(event.latLng);
          updateFromPosition(event.latLng);
        });

        updateFromPosition(marker.getPosition());
      } catch (err) {
        if (!isActive) return;
        setError(err.message || 'Unable to load map picker.');
      }
    };

    initializeMap();

    return () => {
      isActive = false;
    };
  }, [apiKey, initialCenter, onChange]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude),
          lng: Number(pos.coords.longitude),
        };
        mapRef.current.setCenter(coords);
        markerRef.current.setPosition(coords);
        window.google.maps.event.trigger(markerRef.current, 'dragend', {
          latLng: markerRef.current.getPosition(),
        });
        setError('');
      },
      () => setError('Unable to access your current location. Please allow GPS permission.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Tap on map or drag marker to set exact location.</p>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          Use current
        </button>
      </div>

      <div ref={mapElementRef} className="h-56 w-full rounded-lg border border-gray-300" />

      {address && (
        <div className="rounded-md bg-gray-50 p-2 text-xs text-gray-700 border border-gray-200 flex items-start gap-2">
          <MapPin className="h-4 w-4 mt-0.5 text-amz-orange" />
          <span>{address}</span>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
