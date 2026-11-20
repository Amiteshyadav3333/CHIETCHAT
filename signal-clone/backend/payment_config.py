"""Environment checks shared by payment and marketplace routes."""
import os


def razorpay_live_mode_required():
    return os.environ.get('RENDER') == 'true' or os.environ.get('APP_ENV') == 'production'


def razorpay_credentials_ready():
    key_id = os.environ.get('RAZORPAY_KEY_ID', '').strip()
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '').strip()
    if not key_id or not key_secret:
        return False
    # Never allow a simulated test payment to be presented as a real payment
    # on the public production deployment.
    if razorpay_live_mode_required() and not key_id.startswith('rzp_live_'):
        return False
    return True


def razorpay_checkout_ready():
    return razorpay_credentials_ready() and bool(os.environ.get('RAZORPAY_WEBHOOK_SECRET', '').strip())
