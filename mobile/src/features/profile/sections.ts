// Declarative definitions of the profile sections and their fields. The generic
// section editor (app/(app)/profile/[section].tsx) renders a form from these,
// so adding a field is a data change here, not new UI.
//
// Field names match the JSON payload keys the backend expects (ported one-to-one
// from the web frontend forms in main.ts — the two clients must stay in sync on
// the backend contract). Every section is fully specified.
import type { ProfileSectionSlug } from '@/api/profile';

export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean' | 'select';

export type FieldDef = {
  name: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  // Options for a `select` field (mirrors the web frontend's dropdown option lists).
  options?: string[];
};

// Shared option lists, kept identical to the web frontend (main.ts).
const LANGUAGE_LEVEL_OPTIONS = ['Basic', 'Conversational', 'Fluent', 'Native'];
const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'];
const RELIGION_OPTIONS = [
  'Christianity',
  'Islam',
  'Hinduism',
  'Buddhism',
  'Judaism',
  'Sikhism',
  'Other',
  'Prefer not to say',
];
const HAIR_COLOR_OPTIONS = ['Black', 'Brown', 'Blonde', 'Red', 'Grey', 'White', 'Other'];
const EYE_COLOR_OPTIONS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Black', 'Other'];
const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Fixed reference lists (mirror main.ts). Each language stores a proficiency
// level under its slug; each skill a boolean under its slug; each visa a
// `<slug>Held` boolean plus a `<slug>Expiry` date.
const LANGUAGES: { slug: string; label: string }[] = [
  { slug: 'english', label: 'English' },
  { slug: 'german', label: 'German' },
  { slug: 'spanish', label: 'Spanish' },
  { slug: 'dutch', label: 'Dutch' },
];

const PROFESSIONAL_SKILLS: { slug: string; label: string }[] = [
  { slug: 'ah', label: 'AH experience' },
  { slug: 'rov', label: 'ROV experience' },
  { slug: 'rigMove', label: 'RIG-move experience' },
  { slug: 'azimuthAsd', label: 'Azimuth ASD experience' },
  { slug: 'towing', label: 'Towing experience' },
  { slug: 'boatHandling', label: 'Boat handling experience' },
];

const VISAS: { slug: string; label: string }[] = [
  { slug: 'brazil', label: 'Brazil visa' },
  { slug: 'schengen', label: 'Schengen visa' },
  { slug: 'usa', label: 'USA visa' },
  { slug: 'canadian', label: 'Canadian visa' },
  { slug: 'ksa', label: 'KSA visa' },
  { slug: 'uae', label: 'UAE visa' },
  { slug: 'uk', label: 'UK visa' },
];

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
  {
    slug: 'address',
    title: 'Address & airport',
    description: 'Where you live and your nearest airports.',
    fields: [
      { name: 'country', label: 'Country' },
      { name: 'province', label: 'Province' },
      { name: 'city', label: 'City' },
      { name: 'postCode', label: 'Post Code' },
      { name: 'street', label: 'Street' },
      { name: 'houseNumber', label: 'House Number' },
      { name: 'apartmentNumber', label: 'Apartment Number' },
      { name: 'mainAirportName', label: 'Main Airport Name' },
      { name: 'mainAirportTravelTime', label: 'Travel time to main airport (hours)', type: 'number' },
      { name: 'altAirportName', label: 'Alternative Airport Name' },
      {
        name: 'altAirportTravelTime',
        label: 'Travel time to alternative airport (hours)',
        type: 'number',
      },
    ],
  },
  {
    slug: 'languages',
    title: 'Languages',
    description: 'Your proficiency in each language.',
    fields: LANGUAGES.map((language) => ({
      name: language.slug,
      label: language.label,
      type: 'select' as const,
      options: LANGUAGE_LEVEL_OPTIONS,
    })),
  },
  {
    slug: 'skills',
    title: 'Professional skills',
    description: 'Experience you hold.',
    fields: PROFESSIONAL_SKILLS.map((skill) => ({
      name: skill.slug,
      label: skill.label,
      type: 'boolean' as const,
    })),
  },
  {
    slug: 'visas',
    title: 'Visas',
    description: 'Visas you hold and their expiry dates.',
    fields: [
      ...VISAS.flatMap((visa) => [
        { name: `${visa.slug}Held`, label: `${visa.label} — held`, type: 'boolean' as const },
        { name: `${visa.slug}Expiry`, label: `${visa.label} — expiry`, type: 'date' as const },
      ]),
      { name: 'otherVisas', label: 'Other visas' },
    ],
  },
  {
    slug: 'relatives',
    title: 'Relatives & next of kin',
    fields: [
      { name: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL_STATUS_OPTIONS },
      { name: 'dateOfMarriage', label: 'Date of marriage', type: 'date' },
      { name: 'numberOfChildren', label: 'Number of children', type: 'number' },
      { name: 'numberOfSons', label: 'Number of sons', type: 'number' },
      { name: 'numberOfDaughters', label: 'Number of daughters', type: 'number' },
      { name: 'fatherFullName', label: "Father's FULL NAME" },
      { name: 'motherFullName', label: "Mother's FULL NAME" },
      { name: 'nokFirstName', label: 'Next of Kin First Name' },
      { name: 'nokMiddleName', label: 'Next of Kin Middle Name' },
      { name: 'nokSurname', label: 'Next of Kin Surname' },
      { name: 'nokAddress', label: 'Next of Kin Address' },
      { name: 'nokRelationDegree', label: 'Next of Kin Relation Degree' },
      { name: 'nokContactPhone', label: 'Next of kin contact phone', type: 'phone' },
      { name: 'emergencyContactName', label: 'Emergency Contact Name' },
    ],
  },
  {
    slug: 'misc',
    title: 'Notes & miscellaneous',
    fields: [
      { name: 'coverallSize', label: 'Working Coverall Size' },
      { name: 'bodyWeight', label: 'Body Weight (kg)', type: 'number' },
      { name: 'bodyHeight', label: 'Body Height (cm)', type: 'number' },
      { name: 'shoeSize', label: 'Working Shoe Size' },
      { name: 'religion', label: 'Religion', type: 'select', options: RELIGION_OPTIONS },
      { name: 'hairColor', label: 'Hair color', type: 'select', options: HAIR_COLOR_OPTIONS },
      { name: 'eyeColor', label: 'Eye color', type: 'select', options: EYE_COLOR_OPTIONS },
      { name: 'bloodType', label: 'Blood type', type: 'select', options: BLOOD_TYPE_OPTIONS },
      { name: 'notes', label: 'Notes' },
    ],
  },
];

export function getSection(slug: string): SectionDef | undefined {
  return PROFILE_SECTIONS.find((section) => section.slug === slug);
}
