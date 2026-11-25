import { formatDisplayDate, formatDisplayDateRange } from './displayDate';

type RecordValues = Record<string, unknown>;
type ProfileFields = { title: string; fields: [string, string][] };

function record(value: unknown): RecordValues {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValues : {};
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function entries(value: unknown, legacy?: unknown) {
  const rows = Array.isArray(value) ? value.map(record).filter(row => Object.keys(row).length) : [];
  const fallback = record(legacy);
  return rows.length ? rows : [fallback];
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean).join(', ') : text(value);
}

const addressLabels = [
  ['Country', 'country'], ['Region', 'region'], ['Province', 'province'], ['City / Municipality', 'city'],
  ['Barangay', 'barangay'], ['Street / House No. / Purok', 'street'], ['ZIP Code', 'zipCode'],
];

export function employeeApplicationFields(employee: RecordValues, applicant: RecordValues | null, savedDetails: unknown): ProfileFields[] {
  const application = applicant ?? {};
  const details = record(savedDetails);
  const education = record(details.educationBackground);
  const date = (value: unknown) => formatDisplayDate(text(value));
  const birthplace = text(details.birthplace, employee.birthplace, application.birthplace);
  const birthdate = text(details.birthdate, employee.birthdate, application.birthdate);
  const address = (title: string, value: unknown, full?: string, birthplaceOnly = false): ProfileFields => {
    const parts = record(value);
    const fields: ProfileFields['fields'] = (birthplaceOnly ? addressLabels.slice(0, 4) : addressLabels)
      .map(([label, key]) => [label, text(parts[key])]);
    if (full && !fields.some(([, entry]) => entry)) fields.unshift([title, full]);
    return { title, fields };
  };

  return [
    { title: 'Personal Details', fields: [
      ['First Name', text(details.firstName, employee.first_name, application.first_name)],
      ['Middle Name', text(details.middleName, employee.middle_name, application.middle_name)],
      ['Last Name', text(details.lastName, employee.last_name, application.last_name)],
      ['Suffix', text(details.suffix, employee.suffix, application.suffix)],
      ['Date of Birth', date(text(details.birthdate, birthdate))],
      ['Age', text(details.age)],
      ['Gender', text(details.gender, employee.gender, application.gender)],
      ['Civil Status', text(details.civilStatus, employee.civil_status, application.civil_status)],
      ['Nationality', text(details.nationality, employee.nationality)],
      ['Height (cm)', text(details.height, employee.height, application.height)],
      ['Weight (kg)', text(details.weight, employee.weight, application.weight)],
    ] },
    address('Birthplace', details.birthplaceParts, birthplace, true),
    address('Current Address', details.currentAddressParts, text(details.currentAddress)),
    address('Permanent Address', details.permanentAddressParts, text(details.permanentAddress)),
    { title: 'Highest Educational Background', fields: [
      ['Highest Educational Level', text(education.level, employee.education, application.education)],
      ['Name of School', text(education.schoolName)],
      ['Course / Program', text(education.courseProgram)],
      ['Year Graduated', text(education.yearGraduated)],
    ] },
    ...entries(details.workExperiences, details.workExperience).map((work, index): ProfileFields => ({
      title: index === 0 ? 'Work Experience' : `Work Experience ${index + 1}`,
      fields: [
        ['Company / Organization', text(work.companyOrganization)],
        ['Position Held', text(work.positionHeld)],
        ['Total Years of Work Experience', text(work.totalYearsExperience, index === 0 ? text(employee.experience, application.experience) : '')],
        ['Employment Start Date', date(work.employmentStartDate)],
        ['Employment End Date', date(work.employmentEndDate)],
        ...(!work.employmentStartDate && !work.employmentEndDate && text(work.employmentPeriod)
          ? [['Employment Period', formatDisplayDateRange(text(work.employmentPeriod))] as [string, string]] : []),
        ['Duties / Responsibilities', text(work.dutiesResponsibilities)],
      ],
    })),
    { title: 'Skills and Qualifications', fields: [
      ['Skills', list(details.skills)],
      ['Other Skills', text(details.otherSkills)],
      ['Certifications / Training', list(details.certifications)],
    ] },
    ...entries(details.characterReferences).map((reference, index): ProfileFields => ({
      title: index === 0 ? 'Character References' : `Character Reference ${index + 1}`,
      fields: [
        ['Reference Name', text(reference.name)], ['Position', text(reference.position)],
        ['Company / Organization', text(reference.company)], ['Reference Contact Number', text(reference.contact)],
      ],
    })),
    ...entries(details.emergencyContacts, details.emergencyContact).map((contact, index): ProfileFields => ({
      title: index === 0 ? 'Emergency Contact Details' : `Emergency Contact ${index + 1}`,
      fields: [
        ['Emergency Contact Person', text(contact.name)], ['Relationship', text(contact.relation === 'Other' && contact.relationOther, contact.relation)],
        ['Emergency Contact Number', text(contact.phone)], ['Emergency Contact Address', text(contact.address)],
      ],
    })),
    { title: 'Applicant Declaration', fields: [
      ["Applicant's Signature / Full Name", text(details.applicantSignature)],
      ['Declaration Date', date(details.declarationDate)],
    ] },
  ];
}
