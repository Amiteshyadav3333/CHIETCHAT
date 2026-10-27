"""Application-level encryption helpers for private seller verification data."""
import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SellerKycUnavailable(RuntimeError):
    pass


def _key():
    secret = os.environ.get('SELLER_KYC_ENCRYPTION_KEY', '').strip()
    if len(secret) < 32:
        raise SellerKycUnavailable('Seller document encryption is not configured')
    return hashlib.sha256(secret.encode('utf-8')).digest()


def encrypt_private_bytes(value, context):
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, bytes(value), str(context).encode('utf-8'))
    return nonce + ciphertext


def decrypt_private_bytes(value, context):
    encrypted = bytes(value or b'')
    if len(encrypted) < 29:
        raise SellerKycUnavailable('Encrypted seller data is invalid')
    try:
        return AESGCM(_key()).decrypt(encrypted[:12], encrypted[12:], str(context).encode('utf-8'))
    except Exception as error:
        raise SellerKycUnavailable('Seller data could not be decrypted; check the stable encryption key') from error


def encrypt_private_profile(user_id, value):
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return encrypt_private_bytes(payload, f'seller-profile:{user_id}')


def decrypt_private_profile(seller):
    if not seller.private_data_encrypted:
        return {'legalName': seller.legal_name, 'businessAddress': seller.business_address,
                'returnAddress': seller.return_address or '', 'taxIdentifier': '',
                'registrationNumber': ''}
    try:
        raw = decrypt_private_bytes(seller.private_data_encrypted, f'seller-profile:{seller.user_id}')
        value = json.loads(raw.decode('utf-8'))
        return value if isinstance(value, dict) else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SellerKycUnavailable('Seller profile data is invalid') from error


def mask_identifier(value):
    value = str(value or '')
    return f"{'•' * max(0, len(value) - 4)}{value[-4:]}" if value else ''


def required_document_types(seller_type):
    required = ['identity_proof', 'address_proof', 'tax_document']
    if seller_type in {'company', 'partnership'}:
        required.append('business_registration')
    return required
