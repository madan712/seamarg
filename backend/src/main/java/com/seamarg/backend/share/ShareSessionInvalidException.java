package com.seamarg.backend.share;

/**
 * The {@code X-Share-Session} token is missing, malformed, tampered with, or
 * expired. Surfaced as {@code 401 Unauthorized}; the recipient must redeem the
 * link again.
 */
class ShareSessionInvalidException extends RuntimeException {

	ShareSessionInvalidException(String message) {
		super(message);
	}
}
