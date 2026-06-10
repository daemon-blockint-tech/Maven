// Function to display banner warning for TTK prefix vs route origin

function showPrefixWarning(prefixOrigin, routeOrigin) {
    if (prefixOrigin !== routeOrigin) {
        alert('Warning: TTK prefix does not match the route origin!');
    }
}

// Call this function in the relevant part of the POS new flow; check prefixes and display warnings accordingly.