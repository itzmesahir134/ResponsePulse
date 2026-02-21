/**
 * Fetches nearby places of a specific type (e.g., 'hospital', 'police') using Google Places API
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @param {string} type Google Places type (e.g., 'hospital', 'police')
 * @returns {Promise<Array>} Array of place results
 */
export const getNearbyPlaces = (lat, lng, type) => {
    return new Promise((resolve, reject) => {
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            return reject(new Error("Google Maps Places API not loaded"));
        }

        const location = new window.google.maps.LatLng(lat, lng);
        // PlacesService requires a DOM element or a map instance, a dummy div works
        const dummyNode = document.createElement('div');
        const service = new window.google.maps.places.PlacesService(dummyNode);

        const request = {
            location: location,
            radius: '5000', // 5km radius
            type: [type]
        };

        service.nearbySearch(request, (results, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                // Map to simpler format for our frontend
                const formattedResults = results.map(place => ({
                    id: place.place_id,
                    name: place.name,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    address: place.vicinity,
                    type: type
                }));
                resolve(formattedResults);
            } else if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                resolve([]);
            } else {
                reject(new Error(`Places API search failed: ${status}`));
            }
        });
    });
};
