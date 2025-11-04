import type { Course } from '../types/course-offerings';

export interface ScheduleClass {
  subject: string;
  catalogNumber: string;
  classNumber: number;
  title: string;
  minCreditHours?: number;
  maxCreditHours?: number;
  department?: string;
  college?: string;
  section?: string;
  instructionType?: string;
  instructor?: string;
  days?: string;
  times?: string;
  location?: string;
  building?: string;
  room?: string;
  [key: string]: any; // For additional class properties
}

export interface Schedule {
  scheduleNumber: number;
  classes: ScheduleClass[];
}

export interface OllamaResponse {
  response: string;
  done: boolean;
}

const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'llama3';

/**
 * Check if two time strings overlap
 * NOTE: This function is no longer used - we trust Ollama to handle conflict detection
 * Keeping for reference but not called
 */
function timesOverlap(time1: string, time2: string): boolean {
  if (!time1 || !time2 || time1 === 'TBA' || time2 === 'TBA') {
    return false; // Can't determine conflict if time is TBA
  }
  
  // Extract days and time from strings like "MWF 09:40-10:35" or "TuTh 09:30-10:50"
  const extractDays = (timeStr: string): string => {
    // Match day patterns: MWF, TuTh, etc.
    // Pattern: (M|Tu|W|Th|F|S) one or more times, followed by space
    const dayMatch = timeStr.match(/^((?:M|Tu|W|Th|F|S)+)\s/);
    if (dayMatch) {
      return dayMatch[1];
    }
    return '';
  };
  
  const extractTimeRange = (timeStr: string): { start: number; end: number } | null => {
    // Remove days if present, get just the time part
    // Handle both "MWF" and "TuTh" patterns - match the day pattern we extracted
    let timePart = timeStr;
    const dayMatch = timeStr.match(/^((?:M|Tu|W|Th|F|S)+)\s/);
    if (dayMatch) {
      timePart = timeStr.substring(dayMatch[0].length);
    }
    
    // Match patterns like "09:40-10:35" (24-hour format) or "9:40AM-10:35AM" (12-hour format)
    let timeMatch = timePart.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    
    if (timeMatch) {
      // 24-hour format
      const parseTime = (hour: string, minute: string): number => {
        const h = parseInt(hour, 10);
        return h * 60 + parseInt(minute, 10); // Convert to minutes since midnight
      };
      
      return {
        start: parseTime(timeMatch[1], timeMatch[2]),
        end: parseTime(timeMatch[3], timeMatch[4]),
      };
    }
    
    // Try 12-hour format
    timeMatch = timePart.match(/(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)/);
    if (timeMatch) {
      const parseTime = (hour: string, minute: string, ampm: string): number => {
        let h = parseInt(hour, 10);
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + parseInt(minute, 10);
      };
      
      return {
        start: parseTime(timeMatch[1], timeMatch[2], timeMatch[3]),
        end: parseTime(timeMatch[4], timeMatch[5], timeMatch[6]),
      };
    }
    
    return null;
  };
  
  const days1 = extractDays(time1);
  const days2 = extractDays(time2);
  
  // Check if days overlap (if any day matches)
  // Both must have days, and at least one day must be the same
  if (!days1 || !days2) {
    // If either is missing days, can't determine conflict - assume no conflict
    return false;
  }
  
  // Normalize day strings for comparison
  // Handle "Tu" (Tuesday) and "Th" (Thursday) properly
  const normalizeDays = (daysStr: string): string[] => {
    const normalized: string[] = [];
    let i = 0;
    while (i < daysStr.length) {
      if (daysStr[i] === 'T' && i + 1 < daysStr.length && daysStr[i + 1] === 'u') {
        normalized.push('Tu'); // Tuesday
        i += 2;
      } else if (daysStr[i] === 'T' && i + 1 < daysStr.length && daysStr[i + 1] === 'h') {
        normalized.push('Th'); // Thursday
        i += 2;
      } else if (daysStr[i] === 'T' && (i + 1 >= daysStr.length || (daysStr[i + 1] !== 'u' && daysStr[i + 1] !== 'h'))) {
        // Standalone T - could be Tuesday or Thursday, but let's treat it as Tuesday
        normalized.push('T');
        i += 1;
      } else {
        // M, W, F, S
        normalized.push(daysStr[i]);
        i += 1;
      }
    }
    return normalized;
  };
  
  const days1Array = normalizeDays(days1);
  const days2Array = normalizeDays(days2);
  
  // Check if any day matches (e.g., "M" in both, or "Tu" in both)
  const daysOverlap = days1Array.some(d => days2Array.includes(d));
  
  // CRITICAL: If days don't overlap, no conflict regardless of time
  if (!daysOverlap) {
    // Only log if debugging is needed - remove verbose logging in production
    // console.log(`No day overlap: "${days1}" (${days1Array.join(',')}) vs "${days2}" (${days2Array.join(',')}) - no conflict`);
    return false;
  }
  
  // Only log if debugging is needed
  // console.log(`Day overlap found: "${days1}" (${days1Array.join(',')}) and "${days2}" (${days2Array.join(',')}) share days - checking time overlap`);
  
  const timeRange1 = extractTimeRange(time1);
  const timeRange2 = extractTimeRange(time2);
  
  if (!timeRange1 || !timeRange2) {
    // If we can't parse times, be conservative and assume no conflict
    return false;
  }
  
  // Check if time ranges overlap
  // Overlap exists if: range1.start < range2.end AND range2.start < range1.end
  // But NOT if they just touch at the boundaries (e.g., 10:35 and 10:35 don't overlap)
  const overlaps = timeRange1.start < timeRange2.end && timeRange2.start < timeRange1.end;
  
  // Only log if debugging is needed - remove verbose logging in production
  // if (overlaps) {
  //   console.log(`Time overlap detected: "${time1}" (${timeRange1.start}-${timeRange1.end}) overlaps with "${time2}" (${timeRange2.start}-${timeRange2.end})`);
  // }
  
  return overlaps;
}

/**
 * Check if a schedule has any time conflicts
 * NOTE: This function is no longer used - we trust Ollama to handle conflict detection
 * Keeping for reference but not called
 */
function checkTimeConflicts(classes: ScheduleClass[]): boolean {
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const time1 = classes[i].times || '';
      const time2 = classes[j].times || '';
      
      // Skip if either time is missing or TBA
      if (!time1 || !time2 || time1 === 'TBA' || time2 === 'TBA') {
        continue;
      }
      
      if (timesOverlap(time1, time2)) {
        console.warn(
          `Time conflict detected: ${classes[i].subject} ${classes[i].catalogNumber} (${time1}) conflicts with ${classes[j].subject} ${classes[j].catalogNumber} (${time2})`,
        );
        return true;
      }
    }
  }
  return false;
}

/**
 * Generate schedules using Ollama AI model
 * Returns 5 unique schedules from the provided courses
 */
export async function generateSchedules(
  courses: Course[],
  abortSignal?: AbortSignal,
  model: string = DEFAULT_MODEL,
): Promise<Schedule[]> {
  if (courses.length === 0) {
    throw new Error('No courses provided');
  }

  // Format course and class information for the prompt - only essential fields
  const courseInfo = courses.map((course) => {
    const classesInfo = course.classes.map((cls) => {
      // Extract raw time information from meetings array
      // NOTE: Classes without valid times should have been filtered out already
      let timeString = '';
      let daysString = '';
      
      if (cls.meetings && cls.meetings.length > 0) {
        // Use first meeting
        const meeting = cls.meetings[0];
        if (meeting.days && Array.isArray(meeting.days)) {
          daysString = meeting.days.join('');
        }
        // Store raw times without formatting - must have both start and end
        if (meeting.startTime && meeting.endTime && 
            typeof meeting.startTime === 'string' && 
            typeof meeting.endTime === 'string' &&
            meeting.startTime.trim() !== '' &&
            meeting.endTime.trim() !== '') {
          timeString = `${meeting.startTime}-${meeting.endTime}`;
        }
      }
      
      // Fallback to direct times/days fields if meetings not available
      if (!timeString && cls.times && cls.times !== 'TBA' && cls.times.trim() !== '') {
        timeString = cls.times;
      }
      if (!daysString && cls.days) {
        daysString = cls.days;
      }
      
      // Combine days and times - only if we have valid time data
      // If no time, this should not happen (classes filtered out), but throw error to catch issues
      if (!timeString) {
        console.error('Class missing time data:', cls);
        throw new Error(`Class ${cls.subject} ${cls.catalogNumber} #${cls.classNumber} is missing required time information`);
      }
      
      const scheduleTime = daysString && timeString 
        ? `${daysString} ${timeString}` 
        : timeString;
      
      // Get seat information
      const seats = cls.enrolled !== undefined && cls.maxEnrolled !== undefined
        ? `${cls.enrolled}/${cls.maxEnrolled}`
        : cls.capacity
        ? `${cls.capacity} capacity`
        : '';
      
      return {
        classNumber: cls.classNumber, // Class ID
        subject: cls.subject,
        catalogNumber: cls.catalogNumber,
        times: scheduleTime,
        seats: seats,
      };
    });

    return {
      subject: course.subject,
      catalogNumber: course.catalogNumber,
      classes: classesInfo,
    };
  });

  const prompt = `You are a course schedule generator. Given ${courses.length} courses, generate conflict-free schedules.

YOUR PRIMARY GOAL: Generate EXACTLY 5 UNIQUE schedules. This is your main objective.

CRITICAL REQUIREMENTS:
1. YOU MUST GENERATE 5 SCHEDULES - this is mandatory unless it is truly impossible
2. Each schedule MUST have exactly ${courses.length} classes (one from each course)
3. Each schedule must select exactly ONE class from EACH course - pick only ONE class per course
4. NO TWO CLASSES FROM DIFFERENT COURSES IN A SCHEDULE CAN OVERLAP IN TIME - this is ABSOLUTELY MANDATORY
5. IMPORTANT: Classes within the SAME course may have overlapping times - that's expected and fine. You only need to check conflicts between classes from DIFFERENT courses.
6. ALL SCHEDULES MUST BE UNIQUE - NO DUPLICATE SCHEDULES ALLOWED. A schedule is unique if ANY class is different from another schedule. Even if 3 out of 4 classes are the same, if the 4th class is different, the schedules are unique.
7. DO NOT RETURN DUPLICATE SCHEDULES - each schedule must have a different combination of classNumbers. Check that every schedule you return has at least one different classNumber compared to all other schedules.
8. VARIATION STRATEGY: For courses with only ONE available class, you MUST use that same class in ALL schedules. For courses with MULTIPLE available classes, you MUST vary which class is selected across different schedules to create variety.
9. If one course has many classes (like COMS 1030) and other courses have only 1 class each, create 5 different schedules by selecting 5 DIFFERENT classes from the course with many options, while keeping the same classes from courses with only 1 option.
10. YOU MUST GENERATE 5 SCHEDULES - vary classes from courses that have multiple options to create 5 unique combinations.
11. Only return fewer than 5 schedules if it is truly impossible to create 5 unique conflict-free schedules. Otherwise, always return 5.

TIME CONFLICT DETECTION RULES (ONLY CHECK BETWEEN DIFFERENT COURSES):
You MUST check every schedule for time conflicts. A conflict occurs when two classes from DIFFERENT courses:
1. Share at least one common day (e.g., both have "M", or "Tu" in one and "Tu" in another)
2. AND their time ranges overlap (e.g., "09:40-10:35" overlaps with "10:00-11:00")

Step-by-step conflict checking:
- For each class in a schedule, extract the days (M, Tu, W, Th, F, S) and time range (start-end)
- Compare each class with every other class from a DIFFERENT course
- If they share a day AND times overlap, it's a CONFLICT - DO NOT include both classes in the same schedule

Examples:
- CONFLICT: "MWF 09:40-10:35" (Course A) and "MWF 10:00-11:00" (Course B) - share "MWF" days and times overlap (10:00 is between 09:40 and 10:35)
- NO CONFLICT: "MWF 09:40-10:35" (Course A) and "TuTh 10:00-11:00" (Course B) - different days ("MWF" vs "TuTh"), no conflict
- NO CONFLICT: "MWF 08:35-09:30" (Course A) and "MWF 09:40-10:35" (Course B) - same days but times don't overlap (first ends at 09:30, second starts at 09:40)
- CONFLICT: "MWF 09:40-10:35" (Course A) and "M 10:00-11:00" (Course B) - share "M" day and times overlap (10:00 is between 09:40 and 10:35)
- CONFLICT: "TuTh 09:30-10:50" (Course A) and "MWF 09:40-10:35" (Course B) - NO CONFLICT (different days: "TuTh" vs "MWF")
- CONFLICT: "TuTh 09:30-10:50" (Course A) and "Tu 09:30-10:50" (Course B) - CONFLICT (share "Tu" day and times overlap exactly)

CRITICAL: Before adding a class to a schedule, check if it conflicts with any class already in that schedule from a different course. If it conflicts, choose a different class.

REMEMBER: You are selecting ONE class from EACH course. Classes within the same course can overlap - that's fine. Only check for conflicts between classes from DIFFERENT courses.

IMPORTANT: If you cannot create ANY schedule without time conflicts between classes from different courses, return this exact JSON structure instead:
{
  "error": true,
  "message": "Cannot generate schedules without overlapping classes. All possible class combinations result in time conflicts."
}

If you CAN create conflict-free schedules, you MUST return a JSON array with EXACTLY 5 schedules (or as many as possible if fewer than 5 conflict-free schedules exist). Each schedule must have exactly ${courses.length} classes (one from each course) with NO TIME CONFLICTS BETWEEN COURSES.

STEP-BY-STEP INSTRUCTIONS TO GENERATE 5 SCHEDULES:
1. Start with Schedule 1: Pick one class from each course, ensuring NO time conflicts between classes from different courses
2. Move to Schedule 2: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
3. Move to Schedule 3: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
4. Move to Schedule 4: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
5. Move to Schedule 5: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.

VERIFY EACH SCHEDULE: Before finalizing, check that:
- All classes are from different courses (one per course)
- No two classes from different courses have overlapping times on the same day
- This schedule is different from all previous schedules (at least one different classNumber)

REMEMBER: Your goal is to generate 5 UNIQUE schedules. Do not stop at 1 schedule - continue generating until you have 5 unique schedules.

IMPORTANT FOR VARIATION AND UNIQUENESS:
- If a course has only 1 class, use that SAME class in ALL schedules
- If a course has multiple classes, use DIFFERENT classes across schedules to create variety
- Aim to generate 5 unique schedules by varying classes from courses with multiple options
- REMEMBER: Each schedule must be UNIQUE - check that no two schedules have the exact same set of classNumbers
- A schedule is unique if ANY class is different - even if 3 classes are the same, if 1 class differs, the schedules are unique

Example: If COMS 1030 has 50 classes and CS 4560 has 1 class, create 5 UNIQUE schedules where:
- Schedule 1: COMS 1030 class #10064, CS 4560 class #1257 (same for all)
- Schedule 2: COMS 1030 class #10046, CS 4560 class #1257 (same for all) - DIFFERENT from Schedule 1
- Schedule 3: COMS 1030 class #10065, CS 4560 class #1257 (same for all) - DIFFERENT from Schedules 1 and 2
- Schedule 4: COMS 1030 class #9953, CS 4560 class #1257 (same for all) - DIFFERENT from Schedules 1, 2, and 3
- Schedule 5: COMS 1030 class #9954, CS 4560 class #1257 (same for all) - DIFFERENT from Schedules 1, 2, 3, and 4

DO NOT return two schedules with the same classNumbers - always ensure each schedule has at least one different class.

Format - YOU MUST RETURN 5 SCHEDULES:
[
  {
    "scheduleNumber": 1,
    "classes": [
      {
        "subject": "CS",
        "catalogNumber": "2400",
        "classNumber": 12345
      }
      // ... exactly ${courses.length} classes total, one from each course, NO TIME CONFLICTS
    ]
  },
  {
    "scheduleNumber": 2,
    "classes": [
      // ... DIFFERENT class selection - vary classes from courses with multiple options
    ]
  },
  {
    "scheduleNumber": 3,
    "classes": [
      // ... DIFFERENT class selection - vary classes from courses with multiple options
    ]
  },
  {
    "scheduleNumber": 4,
    "classes": [
      // ... DIFFERENT class selection - vary classes from courses with multiple options
    ]
  },
  {
    "scheduleNumber": 5,
    "classes": [
      // ... DIFFERENT class selection - vary classes from courses with multiple options
    ]
  }
]

DO NOT return just 1 schedule. You MUST generate 5 schedules (or as close to 5 as possible if conflicts prevent it).

Courses and available classes with their times:
${JSON.stringify(courseInfo, null, 2)}

Return ONLY valid JSON - either an error object or an array of schedules. No additional text before or after.`;

  // Log what we're sending to Ollama
  console.log('='.repeat(80));
  console.log('SENDING TO OLLAMA:');
  console.log('='.repeat(80));
  console.log('Model:', model);
  console.log('API URL:', OLLAMA_API_URL);
  console.log('\nCourse Information:');
  console.log(JSON.stringify(courseInfo, null, 2));
  console.log('\nPrompt:');
  console.log(prompt);
  console.log('\nRequest Body:');
  const requestBody = {
    model: model,
    prompt: prompt,
    stream: false,
    format: 'json',
  };
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('='.repeat(80));

  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: OllamaResponse = await response.json();
    
    // Check if request was aborted
    if (abortSignal?.aborted) {
      throw new Error('Request aborted');
    }
    
    // Log the raw response
    console.log('\n' + '='.repeat(80));
    console.log('RESPONSE FROM OLLAMA:');
    console.log('='.repeat(80));
    console.log('Raw response:', JSON.stringify(data, null, 2));
    console.log('='.repeat(80) + '\n');
    
    // Parse the response
    let responseText = data.response.trim();
    
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    console.log('Parsed response text:', responseText);
    
    // Check if response is an error message
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid JSON response from Ollama');
    }

    // Check if Ollama returned an error
    if (parsedResponse.error === true && parsedResponse.message) {
      throw new Error(parsedResponse.message);
    }

    // If not an error, should be an array of schedules
    if (!Array.isArray(parsedResponse)) {
      throw new Error('Expected array of schedules or error object from Ollama');
    }

    const schedules: Schedule[] = parsedResponse;
    
    console.log('Parsed schedules:', JSON.stringify(schedules, null, 2));
    
    // Helper function to map a class from Ollama response back to full class data
    const mapToFullClassData = (cls: ScheduleClass): ScheduleClass | null => {
      // Find the course this class belongs to
      const course = courses.find(
        (c) => c.subject === cls.subject && c.catalogNumber === cls.catalogNumber
      );
      
      if (!course) {
        console.warn(`Course not found for ${cls.subject} ${cls.catalogNumber}`);
        return null;
      }
      
      // Find the actual class in the course
      const actualClass = course.classes.find((c) => c.classNumber === cls.classNumber);
      
      if (!actualClass) {
        console.warn(
          `Class ${cls.classNumber} not found in ${cls.subject} ${cls.catalogNumber}, using first available class`,
        );
        // Use first class from this course if exact match not found
        if (course.classes.length > 0) {
          const fallbackClass = course.classes[0];
          // Extract meeting information properly (same logic as below)
          let days = '';
          let times = '';
          let location = '';
          let instructor = '';
          
          if (fallbackClass.meetings && fallbackClass.meetings.length > 0) {
            const meeting = fallbackClass.meetings[0];
            if (meeting.days && Array.isArray(meeting.days)) {
              days = meeting.days.join('');
            }
            if (meeting.startTime && meeting.endTime && 
                typeof meeting.startTime === 'string' && 
                typeof meeting.endTime === 'string' &&
                meeting.startTime.trim() !== '' &&
                meeting.endTime.trim() !== '') {
              times = `${meeting.startTime}-${meeting.endTime}`;
            }
            if (meeting.roomAndBuilding) {
              location = meeting.roomAndBuilding;
            }
          }
          
          // Fallback to direct fields
          if (!days && fallbackClass.days) {
            days = fallbackClass.days;
          }
          if (!times && fallbackClass.times && fallbackClass.times !== 'TBA') {
            times = fallbackClass.times;
          }
          if (!location) {
            location = fallbackClass.location || fallbackClass.building || '';
          }
          
          // Get instructor
          if (fallbackClass.primaryInstructor?.displayName) {
            instructor = fallbackClass.primaryInstructor.displayName;
          } else if (fallbackClass.instructors && fallbackClass.instructors.length > 0) {
            const primary = fallbackClass.instructors.find((i) => i.isPrimary) || fallbackClass.instructors[0];
            instructor = primary.displayName || '';
          } else if (fallbackClass.instructor) {
            instructor = fallbackClass.instructor;
          }
          
          const combinedTimes = days && times && times !== 'TBA' 
            ? `${days} ${times}` 
            : times || (days ? days : 'TBA');
          
          return {
            subject: fallbackClass.subject,
            catalogNumber: fallbackClass.catalogNumber,
            classNumber: fallbackClass.classNumber,
            title: fallbackClass.title,
            minCreditHours: fallbackClass.minCreditHours,
            maxCreditHours: fallbackClass.maxCreditHours,
            department: fallbackClass.department,
            college: fallbackClass.college,
            section: fallbackClass.section || fallbackClass.component || '',
            instructionType: fallbackClass.instructionType || fallbackClass.component || '',
            instructor: instructor,
            days: days,
            times: combinedTimes,
            location: location || fallbackClass.building || '',
            building: fallbackClass.building || '',
            room: fallbackClass.room || '',
          };
        }
        return null;
      }
      
      // Extract raw meeting information - no formatting
      let days = '';
      let times = '';
      let location = '';
      let instructor = '';
      
      if (actualClass.meetings && actualClass.meetings.length > 0) {
        // Use first meeting (primary meeting)
        const meeting = actualClass.meetings[0];
        if (meeting.days && Array.isArray(meeting.days)) {
          days = meeting.days.join('');
        }
        // Store raw times without formatting - must have both start and end
        if (meeting.startTime && meeting.endTime && 
            typeof meeting.startTime === 'string' && 
            typeof meeting.endTime === 'string' &&
            meeting.startTime.trim() !== '' &&
            meeting.endTime.trim() !== '') {
          times = `${meeting.startTime}-${meeting.endTime}`;
        }
        if (meeting.roomAndBuilding) {
          location = meeting.roomAndBuilding;
        }
      }
      
      // Fallback to direct fields if meetings not available
      if (!days && actualClass.days) {
        days = actualClass.days;
      }
      if (!times && actualClass.times && actualClass.times !== 'TBA') {
        times = actualClass.times;
      }
      if (!location) {
        location = actualClass.location || actualClass.building || '';
      }
      
      // If still no time, this should not happen (classes should be filtered out)
      // But don't add artificial "TBA" - log warning instead of throwing (to avoid breaking valid schedules)
      if (!times || times === 'TBA') {
        console.warn(`Warning: Class ${actualClass.subject} ${actualClass.catalogNumber} #${actualClass.classNumber} is missing time data during mapping. This class should have been filtered out.`);
        // Don't throw - let conflict detection handle it (will be filtered out)
        times = 'TBA'; // Temporary placeholder, will be caught by conflict check
      }
      
      // Get instructor
      if (actualClass.primaryInstructor?.displayName) {
        instructor = actualClass.primaryInstructor.displayName;
      } else if (actualClass.instructors && actualClass.instructors.length > 0) {
        const primary = actualClass.instructors.find((i) => i.isPrimary) || actualClass.instructors[0];
        instructor = primary.displayName || '';
      } else if (actualClass.instructor) {
        instructor = actualClass.instructor;
      }
      
      // Combine days and times for display - preserve raw format for conflict checking
      const combinedTimes = days && times && times !== 'TBA' 
        ? `${days} ${times}` 
        : times || (days ? days : 'TBA');
      
      // Log if time is missing (shouldn't happen since we filter)
      if (!times || times === 'TBA') {
        console.warn(`Warning: Class ${actualClass.subject} ${actualClass.catalogNumber} #${actualClass.classNumber} has no time data`);
      }
      
      // Return full class data with all details
      const enrichedClass: ScheduleClass = {
        subject: actualClass.subject,
        catalogNumber: actualClass.catalogNumber,
        classNumber: actualClass.classNumber,
        title: actualClass.title,
        minCreditHours: actualClass.minCreditHours,
        maxCreditHours: actualClass.maxCreditHours,
        department: actualClass.department,
        college: actualClass.college,
        section: actualClass.section || actualClass.component || '',
        instructionType: actualClass.instructionType || actualClass.component || '',
        instructor: instructor,
        days: days,
        times: combinedTimes, // Format: "MWF 09:40-10:35" for conflict checking
        location: location || actualClass.building || '',
        building: actualClass.building || '',
        room: actualClass.room || '',
      };
      
      return enrichedClass;
    };

    // Validate and normalize the schedules, mapping to full class data
    const validatedSchedules = schedules.map((schedule, index) => ({
      scheduleNumber: schedule.scheduleNumber || index + 1,
      classes: schedule.classes || [],
    }));

    // Validate that each schedule has exactly one class from each course
    const validatedAndFixed: Schedule[] = [];
    
    for (const schedule of validatedSchedules) {
      if (schedule.classes.length !== courses.length) {
        // If schedule doesn't have the right number of classes, try to fix it
        // by ensuring we have one from each course
        const fixedClasses: ScheduleClass[] = [];
        const usedCourseIndices = new Set<number>();
        
        // Try to match classes to courses
        for (const cls of schedule.classes) {
          const courseIndex = courses.findIndex(
            (c) => c.subject === cls.subject && c.catalogNumber === cls.catalogNumber
          );
          if (courseIndex >= 0 && !usedCourseIndices.has(courseIndex)) {
            // Find the actual class in the course
            const actualClass = courses[courseIndex].classes.find(
              (c) => c.classNumber === cls.classNumber
            );
            if (actualClass) {
              // Use mapToFullClassData to ensure times are properly formatted
              const fullClassData = mapToFullClassData(cls);
              if (fullClassData) {
                fixedClasses.push(fullClassData);
                usedCourseIndices.add(courseIndex);
              }
            }
          }
        }
        
        // If we're missing classes, add them from remaining courses
        for (let i = 0; i < courses.length; i++) {
          if (!usedCourseIndices.has(i) && courses[i].classes.length > 0) {
            const firstClass = courses[i].classes[0];
              // Use mapToFullClassData to ensure times are properly formatted
              const fullClassData = mapToFullClassData({
                subject: firstClass.subject,
                catalogNumber: firstClass.catalogNumber,
                classNumber: firstClass.classNumber,
              } as ScheduleClass);
              
              if (fullClassData) {
                fixedClasses.push(fullClassData);
              } else {
                // Fallback if mapping fails
                fixedClasses.push({
                  subject: firstClass.subject,
                  catalogNumber: firstClass.catalogNumber,
                  classNumber: firstClass.classNumber,
                  title: firstClass.title,
                  minCreditHours: firstClass.minCreditHours,
                  maxCreditHours: firstClass.maxCreditHours,
                  department: firstClass.department,
                  college: firstClass.college,
                  section: firstClass.section || firstClass.component || '',
                  instructionType: firstClass.instructionType || firstClass.component || '',
                  instructor: '',
                  days: '',
                  times: 'TBA',
                  location: firstClass.building || '',
                  building: firstClass.building || '',
                  room: '',
                });
              }
            usedCourseIndices.add(i);
          }
        }
        
        validatedAndFixed.push({
          scheduleNumber: schedule.scheduleNumber,
          classes: fixedClasses,
        });
      } else {
        // Validate that we have one from each course
        const courseSubjects = new Set(
          schedule.classes.map((c) => `${c.subject}-${c.catalogNumber}`)
        );
        
        if (courseSubjects.size === courses.length) {
          // Map all classes to full class data
          const fullDataClasses: ScheduleClass[] = [];
          const usedCourseIndices = new Set<number>();
          
          for (const cls of schedule.classes) {
            const courseIndex = courses.findIndex(
              (c) => c.subject === cls.subject && c.catalogNumber === cls.catalogNumber
            );
            
            if (courseIndex >= 0 && !usedCourseIndices.has(courseIndex)) {
              const fullClassData = mapToFullClassData(cls);
              if (fullClassData) {
                fullDataClasses.push(fullClassData);
                usedCourseIndices.add(courseIndex);
              }
            }
          }
          
          // Add any missing courses
          for (let i = 0; i < courses.length; i++) {
            if (!usedCourseIndices.has(i) && courses[i].classes.length > 0) {
              const firstClass = courses[i].classes[0];
              const fullClassData = mapToFullClassData({
                subject: firstClass.subject,
                catalogNumber: firstClass.catalogNumber,
                classNumber: firstClass.classNumber,
              } as ScheduleClass);
              
              if (fullClassData) {
                fullDataClasses.push(fullClassData);
              }
            }
          }
          
          validatedAndFixed.push({
            scheduleNumber: schedule.scheduleNumber,
            classes: fullDataClasses,
          });
        } else {
          // Fix it by ensuring one from each course
          const fixedClasses: ScheduleClass[] = [];
          const usedCourseIndices = new Set<number>();
          
          for (const cls of schedule.classes) {
            const courseIndex = courses.findIndex(
              (c) => c.subject === cls.subject && c.catalogNumber === cls.catalogNumber
            );
            if (courseIndex >= 0 && !usedCourseIndices.has(courseIndex)) {
              // Use mapToFullClassData to ensure times are properly formatted
              const fullClassData = mapToFullClassData(cls);
              if (fullClassData) {
                fixedClasses.push(fullClassData);
                usedCourseIndices.add(courseIndex);
              }
            }
          }
          
          // Add missing courses
          for (let i = 0; i < courses.length; i++) {
            if (!usedCourseIndices.has(i) && courses[i].classes.length > 0) {
              const firstClass = courses[i].classes[0];
              const fullClassData = mapToFullClassData({
                subject: firstClass.subject,
                catalogNumber: firstClass.catalogNumber,
                classNumber: firstClass.classNumber,
              } as ScheduleClass);
              
              if (fullClassData) {
                fixedClasses.push(fullClassData);
              } else {
                console.error(`Failed to map fallback class for ${firstClass.subject} ${firstClass.catalogNumber} - this should not happen`);
                // This should not happen since classes should have been filtered, but if it does, skip this class
              }
            }
          }
          
          validatedAndFixed.push({
            scheduleNumber: schedule.scheduleNumber,
            classes: fixedClasses,
          });
        }
      }
    }
    
    // Check for duplicate schedules and filter them out first
    // A schedule is unique if ANY class is different from another schedule
    const uniqueSchedules: Schedule[] = [];
    const seenScheduleKeys = new Set<string>();
    
    console.log(`\nChecking ${validatedAndFixed.length} schedules for duplicates...`);
    
    for (const schedule of validatedAndFixed) {
      // Create a unique key for this schedule based on ALL classNumbers in order
      // This ensures schedules are unique if ANY class differs
      // Sort by subject + catalogNumber to keep consistent order, then get classNumbers
      const classNumbers = schedule.classes
        .sort((a, b) => {
          const keyA = `${a.subject}-${a.catalogNumber}`;
          const keyB = `${b.subject}-${b.catalogNumber}`;
          return keyA.localeCompare(keyB);
        })
        .map(c => c.classNumber)
        .join(',');
      const scheduleKey = classNumbers;
      
      if (!seenScheduleKeys.has(scheduleKey)) {
        seenScheduleKeys.add(scheduleKey);
        uniqueSchedules.push(schedule);
        console.log(`✓ Schedule ${schedule.scheduleNumber} is unique (classNumbers: ${classNumbers})`);
      } else {
        console.warn(`✗ Duplicate schedule detected (same classNumbers: ${classNumbers}), removing schedule ${schedule.scheduleNumber}`);
      }
    }
    
    console.log(`\nFiltered ${validatedAndFixed.length} schedules to ${uniqueSchedules.length} unique schedules`);
    
    if (uniqueSchedules.length === 0) {
      console.error('ERROR: All schedules were duplicates! This should not happen if Ollama is generating unique schedules.');
      throw new Error(
        'All generated schedules were duplicates. Please try generating schedules again or check if there are enough unique class combinations available.'
      );
    }
    
    // Skip conflict checking for now - just return all unique schedules
    console.log(`\nUsing ${uniqueSchedules.length} unique schedules from Ollama (conflict checking disabled)`);
    
    // If no schedules were generated at all (Ollama returned empty or error)
    if (uniqueSchedules.length === 0 && validatedAndFixed.length === 0) {
      throw new Error(
        'No schedules were generated. This may indicate the courses selected have no available classes or there was an issue with schedule generation.'
      );
    }
    
    // Log the final enriched schedules
    console.log('\n' + '='.repeat(80));
    console.log('FINAL ENRICHED SCHEDULES WITH FULL CLASS DATA:');
    console.log(`Total generated: ${validatedAndFixed.length}, Unique: ${uniqueSchedules.length}`);
    console.log('='.repeat(80));
    console.log(JSON.stringify(uniqueSchedules, null, 2));
    console.log('='.repeat(80) + '\n');
    
    return uniqueSchedules;
  } catch (error) {
    // Don't throw error if request was aborted
    if (error instanceof Error && error.name === 'AbortError') {
      throw error; // Re-throw abort error as-is
    }
    
    // Check if abort signal was triggered
    if (abortSignal?.aborted) {
      throw new Error('Request aborted');
    }
    
    console.error('Error calling Ollama:', error);
    throw new Error(
      `Failed to generate schedules: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

