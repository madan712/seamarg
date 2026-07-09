package com.seamarg.backend.share;

/** Lifecycle of a document {@link ShareItem}. */
enum ShareStatus {

	/** Live and redeemable until it expires. */
	ACTIVE,

	/** Manually revoked by the owner; never redeemable again. */
	REVOKED
}
