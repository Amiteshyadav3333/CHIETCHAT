def normalize_location_update(data):
    """Return safe WGS84 coordinates or ``None`` for an invalid payload."""
    try:
        lat = float(data.get('lat'))
        lng = float(data.get('lng'))
    except (AttributeError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return {'lat': lat, 'lng': lng}
