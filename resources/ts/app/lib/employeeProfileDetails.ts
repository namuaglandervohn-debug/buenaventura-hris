export type EmployeeProfileFieldSections = Record<string, Record<string, string>>;
export type EmployeeProfileForm = Record<string, any>;

const read = (sections: EmployeeProfileFieldSections, section: string, label: string, fallback = '') =>
  Object.prototype.hasOwnProperty.call(sections[section] ?? {}, label)
    ? sections[section][label]
    : fallback;

const joinAddress = (sections: EmployeeProfileFieldSections, title: string, fallback = '') => {
  if (!sections[title]) return fallback;
  const parts = [
    read(sections, title, 'Street / House No. / Purok'),
    read(sections, title, 'Barangay'),
    read(sections, title, 'City / Municipality'),
    read(sections, title, 'Province'),
    read(sections, title, 'Region'),
    read(sections, title, 'Country'),
    read(sections, title, 'ZIP Code'),
  ].map(value => value.trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : read(sections, title, title, fallback);
};

const splitList = (value: string) => value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);

const addressParts = (sections: EmployeeProfileFieldSections, title: string) => sections[title] ? ({
  country: read(sections, title, 'Country'),
  region: read(sections, title, 'Region'),
  province: read(sections, title, 'Province'),
  city: read(sections, title, 'City / Municipality'),
  barangay: read(sections, title, 'Barangay'),
  street: read(sections, title, 'Street / House No. / Purok'),
  zipCode: read(sections, title, 'ZIP Code'),
}) : undefined;

function sectionNames(sections: EmployeeProfileFieldSections, first: string, prefix: string) {
  return Object.keys(sections)
    .filter(title => title === first || new RegExp(`^${prefix} \\d+$`).test(title))
    .sort((left, right) => left === first ? -1 : right === first ? 1 : Number(left.match(/\d+$/)?.[0]) - Number(right.match(/\d+$/)?.[0]));
}

export function employeeProfileFormFromSections(
  sections: EmployeeProfileFieldSections,
  base: EmployeeProfileForm = {},
): EmployeeProfileForm {
  const personal = 'Personal Details';
  const education = 'Highest Educational Background';
  const government = 'Government and Bank Details';
  const workSections = sectionNames(sections, 'Work Experience', 'Work Experience');
  const referenceSections = sectionNames(sections, 'Character References', 'Character Reference');
  const emergencySections = sectionNames(sections, 'Emergency Contact Details', 'Emergency Contact');
  const birthplaceParts = sections.Birthplace ? [
    read(sections, 'Birthplace', 'City / Municipality'),
    read(sections, 'Birthplace', 'Province'),
    read(sections, 'Birthplace', 'Region'),
    read(sections, 'Birthplace', 'Country'),
  ].map(value => value.trim()).filter(Boolean) : [];
  const birthplace = birthplaceParts.length
    ? birthplaceParts.join(', ')
    : read(sections, 'Birthplace', 'Birthplace', base.birthplace ?? '');

  return {
    ...base,
    firstName: read(sections, personal, 'First Name', base.firstName ?? ''),
    middleName: read(sections, personal, 'Middle Name', base.middleName ?? ''),
    lastName: read(sections, personal, 'Last Name', base.lastName ?? ''),
    suffix: read(sections, personal, 'Suffix', base.suffix ?? ''),
    birthdate: read(sections, personal, 'Date of Birth', base.birthdate ?? ''),
    age: read(sections, personal, 'Age', base.age ?? ''),
    gender: read(sections, personal, 'Gender', base.gender ?? ''),
    civilStatus: read(sections, personal, 'Civil Status', base.civilStatus ?? ''),
    nationality: read(sections, personal, 'Nationality', base.nationality ?? ''),
    height: read(sections, personal, 'Height (cm)', base.height ?? ''),
    weight: read(sections, personal, 'Weight (kg)', base.weight ?? ''),
    birthplace,
    birthplaceParts: addressParts(sections, 'Birthplace'),
    currentAddressParts: addressParts(sections, 'Current Address'),
    permanentAddressParts: addressParts(sections, 'Permanent Address'),
    currentAddress: joinAddress(sections, 'Current Address', base.currentAddress ?? ''),
    permanentAddress: joinAddress(sections, 'Permanent Address', base.permanentAddress ?? ''),
    educationBackground: sections[education] ? {
      ...(base.educationBackground ?? {}),
      level: read(sections, education, 'Highest Educational Level', base.educationBackground?.level ?? ''),
      schoolName: read(sections, education, 'Name of School', base.educationBackground?.schoolName ?? ''),
      courseProgram: read(sections, education, 'Course / Program', base.educationBackground?.courseProgram ?? ''),
      yearGraduated: read(sections, education, 'Year Graduated', base.educationBackground?.yearGraduated ?? ''),
    } : base.educationBackground,
    workExperiences: workSections.length ? workSections.map((title, index) => ({
      companyOrganization: read(sections, title, 'Company / Organization'),
      positionHeld: read(sections, title, 'Position Held'),
      totalYearsExperience: read(sections, title, 'Total Years of Work Experience'),
      employmentStartDate: read(sections, title, 'Employment Start Date'),
      employmentEndDate: read(sections, title, 'Employment End Date'),
      employmentPeriod: read(sections, title, 'Employment Period'),
      dutiesResponsibilities: read(sections, title, 'Duties / Responsibilities'),
    })).filter(work => Object.values(work).some(Boolean)) : base.workExperiences,
    skills: sections['Skills and Qualifications']
      ? splitList(read(sections, 'Skills and Qualifications', 'Skills'))
      : base.skills,
    otherSkills: read(sections, 'Skills and Qualifications', 'Other Skills', base.otherSkills ?? ''),
    certifications: sections['Skills and Qualifications']
      ? splitList(read(sections, 'Skills and Qualifications', 'Certifications / Training'))
      : base.certifications,
    characterReferences: referenceSections.length ? referenceSections.map(title => ({
      name: read(sections, title, 'Reference Name'),
      position: read(sections, title, 'Position'),
      company: read(sections, title, 'Company / Organization'),
      contact: read(sections, title, 'Reference Contact Number'),
    })).filter(reference => Object.values(reference).some(Boolean)) : base.characterReferences,
    emergencyContacts: emergencySections.length ? emergencySections.map(title => ({
      name: read(sections, title, 'Emergency Contact Person'),
      relation: read(sections, title, 'Relationship'),
      phone: read(sections, title, 'Emergency Contact Number'),
      address: read(sections, title, 'Emergency Contact Address'),
    })).filter(contact => Object.values(contact).some(Boolean)) : base.emergencyContacts,
    tin: read(sections, government, 'TIN', base.tin ?? ''),
    sss: read(sections, government, 'SSS', base.sss ?? ''),
    philhealth: read(sections, government, 'PhilHealth', base.philhealth ?? ''),
    pagibig: read(sections, government, 'Pag-IBIG', base.pagibig ?? ''),
    applicantSignature: read(sections, 'Applicant Declaration', "Applicant's Signature / Full Name", base.applicantSignature ?? ''),
    declarationDate: read(sections, 'Applicant Declaration', 'Declaration Date', base.declarationDate ?? ''),
  };
}
