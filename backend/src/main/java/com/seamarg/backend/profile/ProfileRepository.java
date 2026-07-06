package com.seamarg.backend.profile;

import java.util.List;

interface ProfileRepository {

	List<ProfileSectionRecord> findByUserId(String userId);

	ProfileSectionRecord save(ProfileSectionRecord record);

	/**
	 * Returns every stored profile section across all users. Used by the admin
	 * dashboard to enumerate registered users; not used on any hot path.
	 */
	List<ProfileSectionRecord> findAll();
}
