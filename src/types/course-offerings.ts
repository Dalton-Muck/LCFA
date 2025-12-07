// Type definitions for Course Offerings API

export interface Meeting {
  days: string[];
  roomAndBuilding?: string;
  buildingCode?: string;
  startTime?: string;
  endTime?: string;
  meetingNumber?: number;
  [key: string]: any;
}

export interface Instructor {
  isPrimary?: boolean;
  displayName?: string;
  lastName?: string;
  emplId?: string;
  email?: string;
}

export interface ClassResult {
  subject: string;
  catalogNumber: string;
  title: string;
  description?: string;
  requisite?: string;
  topic?: string;
  classNumber: number;
  minCreditHours: number;
  maxCreditHours: number;
  college: string;
  eligibleGrades?: string;
  department: string;
  retake?: string;
  note?: string;
  // Additional detailed fields from API
  section?: string;
  component?: string;
  instructionType?: string;
  instructor?: string;
  days?: string;
  times?: string;
  location?: string;
  building?: string;
  room?: string;
  // Actual API fields
  meetings?: Meeting[];
  instructors?: Instructor[];
  primaryInstructor?: Instructor;
  enrolled?: number;
  maxEnrolled?: number;
  capacity?: number;
  status?: string;
  [key: string]: any; // Allow for additional fields from API
}

export interface ClassesResponse {
  results: ClassResult[];
  metadata?: {
    page: number;
    campus: string;
    lastViewRefreshDate?: string;
  };
  counts: Record<string, number>; // Campus code -> count (e.g., { "ATHN": 1500 })
}

export interface Term {
  strm: string;
  year: number;
  description: string;
  code: string; // TERM_CODE
}

// Course with associated classes (for storing in the app)
export interface Course {
  subject: string;
  catalogNumber: string;
  component?: string; // Component type (Lecture, Lab, Discussion, etc.) - separate from catalogNumber
  title: string;
  classes: ClassResult[]; // All classes for this course, stored but not displayed
}

