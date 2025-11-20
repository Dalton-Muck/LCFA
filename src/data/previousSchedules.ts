// Previous schedules data structure
export interface PreviousScheduleClass {
  subject: string;
  catalogNumber: string;
  classNumber: number;
  timeRange: string;
}

export interface PreviousSchedule {
  scheduleNumber: number;
  name: string;
  classes: PreviousScheduleClass[];
}

export const PREVIOUS_SCHEDULES: PreviousSchedule[] = [
  {
    scheduleNumber: 1,
    name: 'Schedule 1',
    classes: [
      { subject: 'CS', catalogNumber: '2300', classNumber: 6912, timeRange: 'M/W/F 09:40 AM–10:35 AM' },
      { subject: 'CS', catalogNumber: '2300 Lab', classNumber: 6913, timeRange: 'Wed 03:05 PM–04:55 PM' },
      { subject: 'EE', catalogNumber: '1014', classNumber: 6785, timeRange: 'Tue/Thu 09:30 AM–10:50 AM' },
      { subject: 'EE', catalogNumber: '1014 Lab', classNumber: 6862, timeRange: 'Thu 04:10 PM–06:10 PM' },
      { subject: 'ET', catalogNumber: '2905', classNumber: 7239, timeRange: 'Tue/Thu 02:00 PM–03:20 PM' },
    ],
  },
  {
    scheduleNumber: 2,
    name: 'Schedule 2',
    classes: [
      { subject: 'BIOS', catalogNumber: '1300', classNumber: 1130, timeRange: 'M/W/F 09:40 AM–10:35 AM; Mon 3:05 PM–4:00 PM' },
      { subject: 'BIOS', catalogNumber: '1300 Lab', classNumber: 3169, timeRange: 'Fri 11:50 AM–01:10 PM' },
      { subject: 'CHEM', catalogNumber: '1205', classNumber: 2855, timeRange: 'M/W/F 2:00 PM–2:55 PM' },
      { subject: 'CHEM', catalogNumber: '1205 Rec', classNumber: 11204, timeRange: 'Tue 2:00 PM–2:55 PM' },
      { subject: 'CHEM', catalogNumber: '1205 Lab', classNumber: 2024, timeRange: 'Thu 3:30 PM–6:20 PM' },
      { subject: 'PSY', catalogNumber: '1010', classNumber: 1593, timeRange: 'Tue/Thu 12:30 PM–1:50 PM' },
    ],
  },
  {
    scheduleNumber: 3,
    name: 'Schedule 3',
    classes: [
      { subject: 'JOUR', catalogNumber: '1010', classNumber: 9955, timeRange: 'Mon 08:35 AM–09:30 AM' },
      { subject: 'JOUR', catalogNumber: '1010 Discussion', classNumber: 11231, timeRange: 'Wed 08:35 AM–09:30 AM' },
      { subject: 'JOUR', catalogNumber: '2500', classNumber: 9995, timeRange: 'M/W/F 12:55 PM–01:50 PM' },
      { subject: 'HIST', catalogNumber: '2000', classNumber: 2308, timeRange: 'Mon/Wed 10:45 AM–11:40 AM' },
      { subject: 'HIST', catalogNumber: '2000 Discussion', classNumber: 2310, timeRange: 'Fri 09:40 AM–10:35 AM' },
    ],
  },
  {
    scheduleNumber: 4,
    name: 'Schedule 4',
    classes: [
      { subject: 'BA', catalogNumber: '1000', classNumber: 3707, timeRange: 'Mon 09:40 AM–10:35 AM' },
      { subject: 'BA', catalogNumber: '1100', classNumber: 3720, timeRange: 'Tue/Thu 12:30 PM–01:50 PM' },
      { subject: 'MATH', catalogNumber: '1200', classNumber: 2235, timeRange: 'Tue/Thu 11:00 AM–12:20 PM' },
      { subject: 'SASM', catalogNumber: '1010', classNumber: 3892, timeRange: 'Tue/Thu 08:00 AM–09:20 AM' },
    ],
  },
  {
    scheduleNumber: 5,
    name: 'Schedule 5',
    classes: [
      { subject: 'BA', catalogNumber: '1000', classNumber: 11662, timeRange: 'Wed 11:50 AM–12:45 PM' },
      { subject: 'BA', catalogNumber: '1100', classNumber: 3714, timeRange: 'Tue/Thu 12:30 PM–01:50 PM' },
      { subject: 'COMS', catalogNumber: '1030', classNumber: 9647, timeRange: 'Tue/Thu 11:00 AM–12:20 PM' },
      { subject: 'ECON', catalogNumber: '1040', classNumber: 2514, timeRange: 'M/W/F 10:45 AM–11:40 AM' },
    ],
  },
];

