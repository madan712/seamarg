package com.seamarg.backend.profile;

import java.util.List;

interface ProfileRepository {

	List<ProfileSectionRecord> findByUserId(String userId);

	ProfileSectionRecord save(ProfileSectionRecord record);
}
