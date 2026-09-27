"""Ed25519-signed participation records (T4).

The per-event private key is derived deterministically from the server
SECRET_KEY and the event id, so no private key ever needs storage. The
public key is stored on every certificate row and verification recomputes
the signature — anyone can verify without trusting us.
"""
import hashlib
import hmac

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core.config import settings


def _seed(event_id) -> bytes:
    return hashlib.sha256(f"{settings.SECRET_KEY}:{event_id}".encode()).digest()


def keypair(event_id):
    private = Ed25519PrivateKey.from_private_bytes(_seed(event_id))
    return private, private.public_key()


def canonical(event_id, recipient_type, recipient_id, certificate_type, title) -> bytes:
    return "|".join(
        [str(event_id), recipient_type, str(recipient_id), certificate_type, title]
    ).encode()


def sign(event_id, recipient_type, recipient_id, certificate_type, title) -> tuple[str, str]:
    private, public = keypair(event_id)
    signature = private.sign(
        canonical(event_id, recipient_type, recipient_id, certificate_type, title)
    )
    return signature.hex(), public.public_bytes_raw().hex()


def verify(event_id, recipient_type, recipient_id, certificate_type, title, signature: str, public_hex: str) -> bool:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    try:
        public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex))
        public.verify(
            bytes.fromhex(signature),
            canonical(event_id, recipient_type, recipient_id, certificate_type, title),
        )
        # Defense in depth: the key must be the event's own key.
        _, expected = keypair(event_id)
        return hmac.compare_digest(
            expected.public_bytes_raw().hex(), public_hex.lower()
        )
    except Exception:
        return False
