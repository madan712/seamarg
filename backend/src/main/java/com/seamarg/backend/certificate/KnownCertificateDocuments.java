package com.seamarg.backend.certificate;

import java.util.List;

final class KnownCertificateDocuments {

	static final List<String> RANKS = List.of(
		"Deck Cadet",
		"Engine Cadet",
		"Trainee Marine Engineer",
		"Third Officer",
		"Second Officer",
		"Fourth Engineer",
		"Third Engineer",
		"Chief Officer",
		"Second Engineer",
		"Master",
		"Captain",
		"Chief Engineer");

	static final List<DocumentType> DOCUMENT_TYPES = List.of(
		new DocumentType("Passport", "Identity"),
		new DocumentType("CDC", "Sea service"),
		new DocumentType("Continuous Discharge Certificate", "Sea service"),
		new DocumentType("INDOS Number", "Identity"),
		new DocumentType("Medical Fitness Certificate", "Medical"),
		new DocumentType("STCW Basic Safety Training Certificate", "Training"),
		new DocumentType("STCW Advanced Certificates", "Training"),
		new DocumentType("STCW Management Level Certificates", "Training"),
		new DocumentType("Pre-Sea Training Certificate", "Training"),
		new DocumentType("Sponsorship Letter", "Company"),
		new DocumentType("Academic Certificates", "Education"),
		new DocumentType("Engineering Degree Certificate", "Education"),
		new DocumentType("Engineering Diploma Certificate", "Education"),
		new DocumentType("Workshop Certificate", "Training"),
		new DocumentType("Apprenticeship Certificate", "Training"),
		new DocumentType("Joining Instructions", "Company"),
		new DocumentType("Vaccination Certificate", "Medical"),
		new DocumentType("Certificate of Competency", "Competency"),
		new DocumentType("COC", "Competency"),
		new DocumentType("GMDSS GOC Certificate", "Radio"),
		new DocumentType("Sea Service Testimonials", "Sea service"),
		new DocumentType("Watchkeeping Certificate", "Competency"),
		new DocumentType("Flag State Endorsement", "Endorsement"),
		new DocumentType("Chief Officer COC", "Competency"),
		new DocumentType("Second Engineer COC", "Competency"),
		new DocumentType("Master Unlimited COC", "Competency"),
		new DocumentType("Chief Engineer Unlimited COC", "Competency"),
		new DocumentType("Advanced Fire Fighting Certificate", "Training"),
		new DocumentType("Medical First Aid Certificate", "Medical"),
		new DocumentType("Medical Care Certificate", "Medical"),
		new DocumentType("Sea Service Record", "Sea service"),
		new DocumentType("Company Appointment Letter", "Company"),
		new DocumentType("Visa", "Travel"),
		new DocumentType("Company Joining Letter", "Company"));

	private KnownCertificateDocuments() {
	}

	record DocumentType(String name, String category) {
	}
}
