// Add UI warning for price mismatch

function showWarning(message) {
    alert(message);
}

function handlePriceValidation(route_id, price) {
    try {
        validateRoutePrice(route_id, price);
    } catch (error) {
        showWarning(error.message);
    }
}