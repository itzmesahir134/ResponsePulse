import { GoogleMap, useJsApiLoader, Marker, Circle, DirectionsRenderer, HeatmapLayer, InfoWindow } from '@react-google-maps/api'
import { useState, useCallback, useEffect, useMemo } from 'react'

const containerStyle = {
    width: '100%',
    height: '100%'
};

const mapOptions = {
    disableDefaultUI: true, // cleaner look
    zoomControl: true,
    styles: [ // Slate-red theme friendly map
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
        }
    ]
};

export default function AppMap({
    center,
    markers = [],
    redZones = [],
    accidents = [],
    driverLocations = [],
    showHeatmap = true,
    showRedZones = true,
    routeStart,
    routeEnd,
    onRouteUpdate
}) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        libraries: ['places', 'visualization']
    })

    const [directionsResponse, setDirectionsResponse] = useState(null)
    const [selectedMarker, setSelectedMarker] = useState(null)

    const heatmapData = useMemo(() => {
        if (!isLoaded || !window.google || !accidents || !accidents.length) return [];
        return accidents.map(a => ({
            location: new window.google.maps.LatLng(Number(a.latitude), Number(a.longitude)),
            weight: Number(a.severity) || 1
        }));
    }, [isLoaded, accidents]);

    const normalizedRedZones = useMemo(() => {
        if (!isLoaded || !redZones || !redZones.length) return [];
        return redZones.map(z => ({
            ...z,
            center: { lat: Number(z.center_lat), lng: Number(z.center_lon) },
            radius: Number(z.radius)
        }));
    }, [isLoaded, redZones]);

    const onLoad = useCallback(function callback() {
        // Map loaded
    }, [])

    const onUnmount = useCallback(function callback() {
        // Map unmounted
    }, [])

    useEffect(() => {
        if (isLoaded && routeStart && routeEnd) {
            const directionsService = new window.google.maps.DirectionsService()
            directionsService.route(
                {
                    origin: routeStart,
                    destination: routeEnd,
                    travelMode: window.google.maps.TravelMode.DRIVING,
                },
                (result, status) => {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                        setDirectionsResponse(result)
                        if (onRouteUpdate) {
                            const route = result.routes[0].legs[0];
                            onRouteUpdate({
                                distance: route.distance.text,
                                duration: route.duration.text
                            });
                        }
                    } else {
                        console.error(`Error fetching directions ${result}`)
                    }
                }
            )
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDirectionsResponse(null)
            if (onRouteUpdate) onRouteUpdate(null);
        }
    }, [isLoaded, routeStart, routeEnd, onRouteUpdate])

    if (!isLoaded) return <div className="h-full w-full bg-slate-200 animate-pulse flex items-center justify-center rounded-lg">Loading Map...</div>;
    if (!center) return <div className="h-full w-full bg-slate-200 flex items-center justify-center rounded-lg text-slate-500">Waiting for location...</div>;

    return (
        <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={14}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={mapOptions}
            onClick={() => setSelectedMarker(null)}
        >
            {/* Current User Marker */}
            <Marker position={center} icon={{ url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" }} title="You are here" />

            {/* Other Markers (Incidents, Hospitals, etc) */}
            {markers.map((m, i) => (
                <Marker
                    key={i}
                    position={{ lat: m.lat, lng: m.lng }}
                    icon={m.icon}
                    title={m.title}
                    onClick={() => setSelectedMarker(m)}
                />
            ))}

            {selectedMarker && (
                <InfoWindow
                    position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                    onCloseClick={() => setSelectedMarker(null)}
                >
                    <div className="p-2">
                        <p className="text-sm font-bold text-slate-900">{selectedMarker.title}</p>
                    </div>
                </InfoWindow>
            )}

            {/* Driver Locations */}
            {driverLocations.map((d, i) => (
                <Marker key={`driver-${i}`} position={{ lat: d.lat, lng: d.lng }} icon={{ url: "http://maps.google.com/mapfiles/kml/pal2/icon39.png" }} title="Ambulance" />
            ))}

            {/* Red Zones (Circles) */}
            {normalizedRedZones.map(z => (
                <Circle
                    key={z.id}
                    center={z.center}
                    radius={z.radius}
                    visible={showRedZones}
                    options={{
                        fillColor: '#ff0000',
                        fillOpacity: 0.3,
                        strokeColor: '#ff0000',
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                    }}
                />
            ))}

            {/* Accident Heatmaps */}
            <HeatmapLayer
                data={showHeatmap ? heatmapData : []}
                options={{
                    radius: 50,
                    opacity: 0.6,
                    gradient: [
                        'rgba(0, 0, 0, 0)',
                        'rgba(255, 255, 0, 0.8)',
                        'rgba(255, 128, 0, 0.9)',
                        'rgba(255, 0, 0, 1)',
                    ]
                }}
            />

            {/* Directions Line */}
            {directionsResponse && (
                <DirectionsRenderer
                    directions={directionsResponse}
                    options={{
                        polylineOptions: { strokeColor: '#dc2626', strokeWeight: 6 },
                        suppressMarkers: true
                    }}
                />
            )}
        </GoogleMap>
    )
}
