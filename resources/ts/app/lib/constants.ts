// Buenaventura Estate — Shared Constants
// Source: HRIS Capstone Documentation

export const COMPANY = {
  name: 'Buenaventura Estate',
  address: 'Wharf Road, Barangay San Pedro, Panabo City, Davao del Norte',
  established: '1992',
};

export const OUTLETS = [
  'Maria Clara Restaurant',   // Daily 6:00 AM – 10:00 PM
  'Maria Clara Resort',        // Daily 9:00 AM – 11:00 PM
  'Buenaventura Café',         // Daily 9:00 AM – 10:00 PM
];

export const OUTLET_HOURS: Record<string, string> = {
  'Maria Clara Restaurant': '6:00 AM – 10:00 PM',
  'Maria Clara Resort': '9:00 AM – 11:00 PM',
  'Buenaventura Café': '9:00 AM – 10:00 PM',
};

export const POSITIONS = [
  // Executive
  'General Manager',
  'Assistant General Manager',
  // Operations
  'Operations Manager',
  'Front Office & Sales Supervisor',
  // Restaurant/Café Kitchen
  'Chef/Cook',
  'Commis Chef',
  'Dispatcher/Steward',
  // Resort Operations
  'Public/Room Attendant',
  'Pool Attendant',
  'Laundry Attendant',
  'Gardener',
  // HR & Admin
  'HR and Admin Manager',
  'Payroll Staff',
  'Driver/Liaison',
  'Purchaser',
  'Stockman',
  // Accounting & Finance
  'Accounting and Finance Manager',
  'Accounting Officer',
  'Finance Officer',
  'Compliance Officer',
  // General Staff
  'Service Crew',
  'Sales Associate',
  'Cashier',
  'HR Assistant',
  'Security Guard',
  'Maintenance Staff',
];

export const DEPARTMENTS = [
  'Management',
  'Operations',
  'Human Resource and Administration',
  'Accounting and Finance',
  'Restaurant',
  'Resort',
  'Café',
];

// Performance evaluation criteria and weights
export const EVALUATION_CRITERIA = [
  { key: 'workQuality',       label: 'Work Quality',                        weight: 0.15, description: 'Accuracy, completeness, and quality of assigned tasks.' },
  { key: 'jobKnowledge',      label: 'Job Knowledge & Role Competency',     weight: 0.10, description: "Understanding of duties, skills, and ability to perform the assigned role." },
  { key: 'teamwork',          label: 'Teamwork and Cooperation',            weight: 0.10, description: "Ability to work with co-workers, supervisors, and other departments." },
  { key: 'initiative',        label: 'Initiative and Reliability',          weight: 0.10, description: 'Dependability, willingness to help, and ability to work with minimal supervision.' },
  { key: 'peerEvaluation',    label: 'Peer Evaluation',                     weight: 0.10, description: 'Feedback from co-workers.' },
  { key: 'conduct',           label: 'Professional Conduct & Compliance',   weight: 0.10, description: 'Discipline, attitude, rule compliance, and workplace behavior.' },
  { key: 'attendance',        label: 'Attendance & Schedule Compliance',    weight: 0.20, description: 'Punctuality, absences, tardiness, undertime, overtime, and compliance with assigned weekly schedule.' },
  { key: 'performanceOutput', label: 'Performance Output',                  weight: 0.25, description: 'Actual work results, productivity, completed tasks, and role-based output.' },
];

// Application status flow per recruitment process document
export const APPLICATION_STATUSES = [
  'Submitted',
  'Under Review',
  'Missing Requirements',
  'For Interview',
  'Hired',
  'Not Qualified',
];

// Request types
export const REQUEST_TYPES = ['Leave', 'Overtime', 'Undertime'];
