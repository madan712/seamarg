package com.seamarg.backend.share;

/**
 * The share token is unknown, revoked, or expired. Surfaced to the anonymous
 * recipient as {@code 410 Gone} — deliberately not distinguishing the three
 * cases, so a probing client cannot tell a wrong token from a lapsed one.
 */
class ShareGoneException extends RuntimeException {

	ShareGoneException(String message) {
		super(message);
	}
}
