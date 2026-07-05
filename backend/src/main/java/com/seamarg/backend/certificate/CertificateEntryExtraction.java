package com.seamarg.backend.certificate;

/**
 * AI-suggested field values for a detailed certificate entry (Step 2 §5.3–5.8).
 * All fields are optional strings — the frontend uses them only to pre-fill the
 * form for the user to review before saving. Dates are ISO-8601 (YYYY-MM-DD).
 */
public record CertificateEntryExtraction(
		String number,
		String issuedDate,
		String expiryDate,
		String issuePlace,
		String issuingAuthority,
		double confidence,
		String source,
		String notes) {

	static CertificateEntryExtraction empty(String source, String notes) {
		return new CertificateEntryExtraction(null, null, null, null, null, 0.0, source, notes);
	}
}
