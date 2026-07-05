package com.seamarg.backend.certificate;

import java.util.Optional;

/**
 * The six detailed certificate categories (Step 2 §5.3–5.8). The enum name is
 * used in the DynamoDB sort key ({@code CERT#<NAME>#<TYPE_SLUG>}); the slug is
 * the URL/JSON form used by the frontend.
 */
enum CertificateCategory {

	GENERAL("general"),
	NCOC("ncoc"),
	MEDICAL("medical"),
	TANKER("tanker-passenger"),
	OFFSHORE("offshore"),
	FLAGSTATE("flag-state");

	private final String slug;

	CertificateCategory(String slug) {
		this.slug = slug;
	}

	String slug() {
		return slug;
	}

	static Optional<CertificateCategory> fromSlug(String slug) {
		if (slug == null) {
			return Optional.empty();
		}
		for (var category : values()) {
			if (category.slug.equals(slug)) {
				return Optional.of(category);
			}
		}
		return Optional.empty();
	}

	static Optional<CertificateCategory> fromName(String name) {
		if (name == null) {
			return Optional.empty();
		}
		for (var category : values()) {
			if (category.name().equals(name)) {
				return Optional.of(category);
			}
		}
		return Optional.empty();
	}
}
