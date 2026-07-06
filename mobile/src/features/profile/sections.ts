// Declarative definitions of the profile sections and their fields. The generic
// section editor (app/(app)/profile/[section].tsx) renders a form from these,
// so adding a field is a data change here, not new UI.
//
// Field names match the JSON payload keys the backend expects (ported from the
// web frontend forms in main.ts). MAIN and CONTACT are fully specified as
// working examples; the remaining sections list their known fields and can be
// fleshed out as the mobile UI grows.
import type { ProfileSectionSlug } from '@/api/profile';

export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean';

export type FieldDef = {
  name: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
};

export type SectionDef = {
  slug: ProfileSectionSlug;
  title: string;
  description?: string;
  fields: FieldDef[];
};

export const PROFILE_SECTIONS: SectionDef[] = [
  {
    slug: 'main',
    title: 'Main information',
    description: 'Your identity, target position, and education.',
    fields: [
      { name: 'firstName', label: 'First name' },
      { name: 'middleName', label: 'Middle name' },
      { name: 'lastName', label: 'Last name' },
      { name: 'sex', label: 'Sex' },
      { name: 'position', label: 'Position' },
      { name: 'altPosition1', label: 'Alternative position 1' },
      { name: 'altPosition2', label: 'Alternative position 2' },
      { name: 'offshore', label: 'Available for offshore', type: 'boolean' },
      { name: 'dateOfReadiness', label: 'Date of readiness', type: 'date' },
      { name: 'minSalaryUsd', label: 'Minimum salary (USD)', type: 'number' },
      { name: 'citizenship', label: 'Citizenship' },
      { name: 'placeOfBirth', label: 'Place of birth' },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      { name: 'highestEducation', label: 'Highest education' },
      { name: 'yearGraduated', label: 'Year graduated', type: 'number' },
      { name: 'graduatedFrom', label: 'Graduated from' },
      { name: 'educationalLevel', label: 'Educational level' },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact details',
    description: 'How employers and Seamarg reach you.',
    fields: [
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'mobilePhone1', label: 'Mobile phone 1', type: 'phone', placeholder: '+919892558621' },
      { name: 'mobilePhone2', label: 'Mobile phone 2', type: 'phone' },
      { name: 'homeTelephone', label: 'Home telephone', type: 'phone' },
    ],
  },
  {
    slug: 'passport',
    title: 'Passport & seaman book',
    fields: [
      { name: 'passportNumber', label: 'Passport number' },
      { name: 'passportIssueDate', label: 'Passport issue date', type: 'date' },
      { name: 'passportExpiryDate', label: 'Passport expiry date', type: 'date' },
      { name: 'seamanBookNumber', label: 'Seaman book number' },
      { name: 'seamanBookIssueDate', label: 'Seaman book issue date', type: 'date' },
      { name: 'seamanBookExpiryDate', label: 'Seaman book expiry date', type: 'date' },
      { name: 'individualTaxNumber', label: 'Individual tax number' },
    ],
  },
  { slug: 'address', title: 'Address', fields: [] },
  { slug: 'languages', title: 'Languages', fields: [] },
  { slug: 'skills', title: 'Skills', fields: [] },
  { slug: 'visas', title: 'Visas', fields: [] },
  { slug: 'relatives', title: 'Next of kin / relatives', fields: [] },
  { slug: 'misc', title: 'Miscellaneous', fields: [] },
];

export function getSection(slug: string): SectionDef | undefined {
  return PROFILE_SECTIONS.find((section) => section.slug === slug);
}
