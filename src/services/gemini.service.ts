import type { Course } from '../types/course-offerings';

/**
 * Convert 24-hour time format (HH:MM) to 12-hour AM/PM format
 * @param time24 - Time in 24-hour format (e.g., "09:40", "14:00", "13:50")
 * @returns Time in 12-hour format (e.g., "9:40 AM", "2:00 PM", "1:50 PM")
 */
function convertTo12Hour(time24: string): string {
  if (!time24 || typeof time24 !== 'string') return time24;
  
  // Check if already in AM/PM format
  if (time24.includes('AM') || time24.includes('PM') || time24.includes('am') || time24.includes('pm')) {
    return time24;
  }
  
  // Remove any whitespace
  const trimmed = time24.trim();
  
  // Extract hours and minutes
  const [hours, minutes] = trimmed.split(':');
  if (!hours || !minutes) return time24;
  
  const hour24 = parseInt(hours, 10);
  const mins = minutes;
  
  if (isNaN(hour24)) return time24;
  
  // Convert to 12-hour format
  let hour12 = hour24;
  let ampm = 'AM';
  
  if (hour24 === 0) {
    hour12 = 12;
  } else if (hour24 === 12) {
    hour12 = 12;
    ampm = 'PM';
  } else if (hour24 > 12) {
    hour12 = hour24 - 12;
    ampm = 'PM';
  }
  
  return `${hour12}:${mins} ${ampm}`;
}

/**
 * Convert a time range from 24-hour to 12-hour format
 * Handles formats like "09:40-10:35" or "MWF 09:40-10:35"
 */
function convertTimeRangeTo12Hour(timeRange: string): string {
  if (!timeRange || typeof timeRange !== 'string') return timeRange;
  
  // Check if already in AM/PM format
  if (timeRange.includes('AM') || timeRange.includes('PM') || timeRange.includes('am') || timeRange.includes('pm')) {
    return timeRange;
  }
  
  // Pattern to match: optional days prefix, then time-time
  // Examples: "09:40-10:35" or "MWF 09:40-10:35"
  const timePattern = /^((?:M|Tu|W|Th|F|S)+\s+)?(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i;
  const match = timeRange.match(timePattern);
  
  if (match) {
    const days = match[1] ? match[1].trim() : '';
    const startTime = convertTo12Hour(match[2]);
    const endTime = convertTo12Hour(match[3]);
    
    if (days) {
      return `${days} ${startTime}-${endTime}`;
    } else {
      return `${startTime}-${endTime}`;
    }
  }
  
  // If pattern doesn't match, try to convert any HH:MM patterns in the string
  const timeRegex = /(\d{1,2}:\d{2})/g;
  return timeRange.replace(timeRegex, (match) => convertTo12Hour(match));
}

export interface ScheduleClass {
  subject: string;
  catalogNumber: string;
  component?: string;
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
  [key: string]: any;
}

export interface Schedule {
  scheduleNumber: number;
  classes: ScheduleClass[];
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

/**
 * Generate schedules using OpenRouter AI model (x-ai/grok-4.1-fast)
 * Returns 5 unique schedules from the provided courses
 */
export interface PreviousScheduleReference {
  scheduleNumber: number;
  name: string;
  classes: Array<{
    subject: string;
    catalogNumber: string;
    component?: string;
    timeRange: string;
  }>;
}

export async function generateSchedules(
  courses: Course[],
  abortSignal?: AbortSignal,
  apiKey?: string,
  previousSchedule?: PreviousScheduleReference | null,
): Promise<Schedule[]> {
  if (courses.length === 0) {
    throw new Error('No courses provided');
  }

  if (!apiKey) {
    throw new Error('OpenRouter API key is required. Please set VITE_OPENROUTER_API_KEY in your .env file.');
  }

  // Format course and class information for the prompt - only essential fields
  const courseInfo = courses.map((course) => {
    // Extract component from catalogNumber and clean it
    let cleanCatalogNumber = course.catalogNumber;
    let courseComponent = '';
    
    // Check if catalogNumber contains component info and extract it
    if (course.catalogNumber.includes(' Laboratory')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Laboratory\s*$/, '').trim();
      courseComponent = 'Lab';
    } else if (course.catalogNumber.includes(' Lab')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Lab\s*$/, '').trim();
      courseComponent = 'Lab';
    } else if (course.catalogNumber.includes(' Discussion')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Discussion\s*$/, '').trim();
      courseComponent = 'Discussion';
    } else if (course.catalogNumber.includes(' Recitation')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Recitation\s*$/, '').trim();
      courseComponent = 'Recitation';
    } else if (course.catalogNumber.includes(' Seminar')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Seminar\s*$/, '').trim();
      courseComponent = 'Seminar';
    } else if (course.catalogNumber.includes(' Tutorial')) {
      cleanCatalogNumber = course.catalogNumber.replace(/\s*Tutorial\s*$/, '').trim();
      courseComponent = 'Tutorial';
    } else {
      // Try to get component from first class if available
      const firstClass = course.classes[0];
      if (firstClass) {
        courseComponent = (firstClass as any).component || firstClass.instructionType || 'Lecture';
      } else {
        courseComponent = 'Lecture';
      }
    }
    
    const classesInfo = course.classes.map((cls) => {
      // Extract raw time information from meetings array
      let timeString = '';
      let daysString = '';
      
      if (cls.meetings && cls.meetings.length > 0) {
        const meeting = cls.meetings[0];
        if (meeting.days && Array.isArray(meeting.days)) {
          daysString = meeting.days.join('');
        }
        if (meeting.startTime && meeting.endTime && 
            typeof meeting.startTime === 'string' && 
            typeof meeting.endTime === 'string' &&
            meeting.startTime.trim() !== '' &&
            meeting.endTime.trim() !== '') {
          // Convert to AM/PM format
          const start12 = convertTo12Hour(meeting.startTime);
          const end12 = convertTo12Hour(meeting.endTime);
          timeString = `${start12}-${end12}`;
        }
      }
      
      // Fallback to direct times/days fields if meetings not available
      if (!timeString && cls.times && cls.times !== 'TBA' && cls.times.trim() !== '') {
        // Convert to AM/PM format if needed
        timeString = convertTimeRangeTo12Hour(cls.times);
      }
      if (!daysString && cls.days) {
        daysString = cls.days;
      }
      
      if (!timeString) {
        console.error('Class missing time data:', cls);
        throw new Error(`Class ${cls.subject} ${cleanCatalogNumber} #${cls.classNumber} is missing required time information`);
      }
      
      const scheduleTime = daysString && timeString 
        ? `${daysString} ${timeString}` 
        : timeString;
      
      const seats = cls.enrolled !== undefined && cls.maxEnrolled !== undefined
        ? `${cls.enrolled}/${cls.maxEnrolled}`
        : cls.capacity
        ? `${cls.capacity} capacity`
        : '';
      
      // For classes sent to model, only include classNumber, times, and seats
      // (subject, catalogNumber, component are at course level)
      return {
        classNumber: cls.classNumber,
        times: scheduleTime,
        seats: seats,
      };
    });
    
    return {
      subject: course.subject,
      catalogNumber: cleanCatalogNumber,
      component: courseComponent,
      classes: classesInfo,
    };
  });

  // Build previous schedule reference text if provided
  let previousScheduleText = '';
  if (previousSchedule && previousSchedule.classes) {
    previousScheduleText = `

PREVIOUS SCHEDULE REFERENCE:
The user has provided a previous schedule (${previousSchedule.name}) that they want to match as closely as possible.
Your PRIMARY GOAL is to generate schedules that MATCH THE EXACT TIMES from the previous schedule.

Previous Schedule Details:
${previousSchedule.classes.map((cls, idx) => 
  `${idx + 1}. ${cls.subject} ${cls.catalogNumber}${cls.component ? ` (${cls.component})` : ''} - Time: ${cls.timeRange}`
).join('\n')}

CRITICAL TIME MATCHING RULES (HIGHEST PRIORITY):
1. EXACT TIME MATCHES ARE MANDATORY: If a class in the previous schedule had "M/W/F 9:40 AM–10:35 AM" and there is a class available with the EXACT SAME time "M/W/F 9:40 AM–10:35 AM", you MUST select that class. This is not optional - it is REQUIRED.
2. If an exact time match exists, you MUST use it, even if it means other classes in the schedule need to be adjusted to avoid conflicts.
3. If no exact match exists, find the CLOSEST possible time match:
   - Match the DAYS first (if previous was M/W/F, prefer M/W/F classes)
   - Then match the TIME RANGE as closely as possible (if previous was 9:40-10:35, prefer 9:40-10:35 or 9:30-10:20 over 2:00-3:20)
4. The FIRST schedule you generate MUST be the MOST SIMILAR to the previous schedule, prioritizing exact time matches above all else.
5. Subsequent schedules can vary more, but still prioritize time similarity where possible.

This is the HIGHEST PRIORITY requirement - matching times from the previous schedule is more important than other considerations.`;
  }

  const prompt = `You are a course schedule generator. Given ${courses.length} courses, generate conflict-free schedules.${previousScheduleText}

YOUR PRIMARY GOAL: Generate EXACTLY 5 UNIQUE schedules. This is your main objective.

CRITICAL REQUIREMENTS:
1. YOU MUST GENERATE 5 SCHEDULES - this is mandatory unless it is truly impossible
2. Each schedule MUST have exactly ${courses.length} classes (one from each course)
3. Each schedule must select exactly ONE class from EACH course - pick only ONE class per course
4. COMPONENT AWARENESS (CRITICAL): Courses with different components (e.g., "HIST 1330" with component "Lecture" vs "HIST 1330" with component "Discussion") are DIFFERENT COURSES. You MUST schedule BOTH if both are in the course list. For example:
   - If you see "HIST 1330" with component "Lecture" and "HIST 1330" with component "Discussion" as separate courses, you MUST select ONE class from EACH:
     * One class from "HIST 1330" (component: "Lecture")
     * One class from "HIST 1330" (component: "Discussion")
   - DO NOT select two Lecture classes when one course is Lecture and another is Discussion/Lab/etc.
   - The component field at the course level tells you which component type to select - all classes under that course will have the same component type.
5. NO TWO CLASSES FROM DIFFERENT COURSES IN A SCHEDULE CAN OVERLAP IN TIME - this is ABSOLUTELY MANDATORY
6. IMPORTANT: Classes within the SAME course may have overlapping times - that's expected and fine. You only need to check conflicts between classes from DIFFERENT courses.
7. ALL SCHEDULES MUST BE UNIQUE - NO DUPLICATE SCHEDULES ALLOWED. A schedule is unique if ANY class is different from another schedule. Even if 3 out of 4 classes are the same, if the 4th class is different, the schedules are unique.
8. DO NOT RETURN DUPLICATE SCHEDULES - each schedule must have a different combination of classNumbers. Check that every schedule you return has at least one different classNumber compared to all other schedules.
9. VARIATION STRATEGY: For courses with only ONE available class, you MUST use that same class in ALL schedules. For courses with MULTIPLE available classes, you MUST vary which class is selected across different schedules to create variety.
10. If one course has many classes (like COMS 1030) and other courses have only 1 class each, create 5 different schedules by selecting 5 DIFFERENT classes from the course with many options, while keeping the same classes from courses with only 1 option.
11. YOU MUST GENERATE 5 SCHEDULES - vary classes from courses that have multiple options to create 5 unique combinations.
12. Only return fewer than 5 schedules if it is truly impossible to create 5 unique conflict-free schedules. Otherwise, always return 5.

TIME FORMAT REQUIREMENT:
- ALL TIMES MUST BE IN 12-HOUR AM/PM FORMAT (e.g., "9:40 AM", "2:00 PM", "1:50 PM")
- DO NOT use 24-hour/military time format (e.g., "09:40", "14:00", "13:50")
- Examples of correct format: "MWF 9:40 AM-10:35 AM", "TuTh 2:00 PM-3:20 PM", "M 12:00 PM-1:00 PM"

TIME CONFLICT DETECTION RULES (ONLY CHECK BETWEEN DIFFERENT COURSES):
You MUST check every schedule for time conflicts. A conflict occurs when two classes from DIFFERENT courses:
1. Share at least one common day (e.g., both have "M", or "Tu" in one and "Tu" in another)
2. AND their time ranges overlap (e.g., "9:40 AM-10:35 AM" overlaps with "10:00 AM-11:00 AM")

Step-by-step conflict checking:
- For each class in a schedule, extract the days (M, Tu, W, Th, F, S) and time range (start-end in AM/PM format)
- Compare each class with every other class from a DIFFERENT course
- If they share a day AND times overlap, it's a CONFLICT - DO NOT include both classes in the same schedule

Examples:
- CONFLICT: "MWF 9:40 AM-10:35 AM" (Course A) and "MWF 10:00 AM-11:00 AM" (Course B) - share "MWF" days and times overlap (10:00 AM is between 9:40 AM and 10:35 AM)
- NO CONFLICT: "MWF 9:40 AM-10:35 AM" (Course A) and "TuTh 10:00 AM-11:00 AM" (Course B) - different days ("MWF" vs "TuTh"), no conflict
- NO CONFLICT: "MWF 8:35 AM-9:30 AM" (Course A) and "MWF 9:40 AM-10:35 AM" (Course B) - same days but times don't overlap (first ends at 9:30 AM, second starts at 9:40 AM)
- CONFLICT: "MWF 9:40 AM-10:35 AM" (Course A) and "M 10:00 AM-11:00 AM" (Course B) - share "M" day and times overlap (10:00 AM is between 9:40 AM and 10:35 AM)
- NO CONFLICT: "TuTh 9:30 AM-10:50 AM" (Course A) and "MWF 9:40 AM-10:35 AM" (Course B) - NO CONFLICT (different days: "TuTh" vs "MWF")
- CONFLICT: "TuTh 9:30 AM-10:50 AM" (Course A) and "Tu 9:30 AM-10:50 AM" (Course B) - CONFLICT (share "Tu" day and times overlap exactly)

CRITICAL: Before adding a class to a schedule, check if it conflicts with any class already in that schedule from a different course. If it conflicts, choose a different class.

REMEMBER: 
- You are selecting ONE class from EACH course. Classes within the same course can overlap - that's fine. Only check for conflicts between classes from DIFFERENT courses.
- Each course has a specific component type (Lecture, Lab, Discussion, etc.) shown in the "component" field. All classes under a course have the same component type, so you just need to select by classNumber.
- When returning your response, include the subject, catalogNumber, component, classNumber, and times (with days) for each class.

IMPORTANT: If you cannot create ANY schedule without time conflicts between classes from different courses, return this exact JSON structure instead:
{
  "error": true,
  "message": "Cannot generate schedules without overlapping classes. All possible class combinations result in time conflicts."
}

If you CAN create conflict-free schedules, you MUST return a JSON array with EXACTLY 5 schedules (or as many as possible if fewer than 5 conflict-free schedules exist). Each schedule must have exactly ${courses.length} classes (one from each course) with NO TIME CONFLICTS BETWEEN COURSES.

STEP-BY-STEP INSTRUCTIONS TO GENERATE 5 SCHEDULES:
${previousSchedule ? `
1. Start with Schedule 1: This is CRITICAL - make this the MOST SIMILAR to the previous schedule. 
   - For each course, FIRST check if there is a class with the EXACT SAME time as the previous schedule. If yes, you MUST select that class.
   - If no exact match, find the closest time match (same days, similar time range).
   - IMPORTANT: Match the component type - if previous schedule had "HIST 1330 Discussion", select a Discussion component class, not a Lecture.
   - Ensure NO time conflicts between classes from different courses.
2. Move to Schedule 2: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options, but still try to maintain some similarity to previous schedule times where possible. Match component types correctly. Check for conflicts.
3. Move to Schedule 3: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
4. Move to Schedule 4: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
5. Move to Schedule 5: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
` : `
1. Start with Schedule 1: Pick one class from each course, ensuring:
   - The class component matches the course component type (Lecture, Lab, Discussion, etc.)
   - NO time conflicts between classes from different courses
2. Move to Schedule 2: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
3. Move to Schedule 3: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
4. Move to Schedule 4: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
5. Move to Schedule 5: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Match component types correctly. Check for conflicts.
`}

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
        "component": "Lecture",
        "classNumber": 12345,
        "times": "MWF 9:40 AM-10:35 AM"
      }
      // ... exactly ${courses.length} classes total, one from each course, NO TIME CONFLICTS
      // Each class MUST include: subject, catalogNumber, component, classNumber, and times (with days in AM/PM format)
      // IMPORTANT: All times must be in 12-hour AM/PM format (e.g., "9:40 AM-10:35 AM", NOT "09:40-10:35")
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

  // Log what we're sending to OpenRouter
  console.log('='.repeat(80));
  console.log('SENDING TO OPENROUTER:');
  console.log('='.repeat(80));
  console.log('Model:', DEFAULT_MODEL);
  console.log('API URL:', OPENROUTER_API_URL);
  console.log('\nCourse Information:');
  console.log(JSON.stringify(courseInfo, null, 2));
  console.log('\nPrompt:');
  console.log(prompt);
  console.log('='.repeat(80));

  const requestBody = {
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 8192,
  };

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'LCFA Course Schedule Generator',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    
    // Check if request was aborted
    if (abortSignal?.aborted) {
      throw new Error('Request aborted');
    }
    
    // Log the raw response
    console.log('\n' + '='.repeat(80));
    console.log('RESPONSE FROM OPENROUTER:');
    console.log('='.repeat(80));
    console.log('Raw response:', JSON.stringify(data, null, 2));
    console.log('='.repeat(80) + '\n');
    
    // Parse the response - OpenRouter returns the text in choices[0].message.content
    let responseText = '';
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content) {
        responseText = choice.message.content || '';
      }
    }
    
    if (!responseText) {
      throw new Error('No response text from OpenRouter API');
    }
    
    responseText = responseText.trim();
    
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
      console.error('Failed to parse JSON:', e);
      console.error('Response text was:', responseText);
      throw new Error('Invalid JSON response from OpenRouter');
    }

    // Check if OpenRouter returned an error
    if (parsedResponse.error === true && parsedResponse.message) {
      throw new Error(parsedResponse.message);
    }

    // If not an error, should be an array of schedules
    if (!Array.isArray(parsedResponse)) {
      throw new Error('Expected array of schedules or error object from OpenRouter');
    }

    const schedules: Schedule[] = parsedResponse;

    console.log('Parsed schedules:', JSON.stringify(schedules, null, 2));
    
    // Helper function to map a class from OpenRouter response back to full class data
    const mapToFullClassData = (cls: ScheduleClass): ScheduleClass | null => {
      // Extract component from catalogNumber if needed, or use component from response
      let cleanCatalogNumber = cls.catalogNumber;
      let component = cls.component || '';
      
      // If catalogNumber still has component info, extract it
      if (cls.catalogNumber.includes(' Laboratory')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Laboratory\s*$/, '').trim();
        if (!component) component = 'Lab';
      } else if (cls.catalogNumber.includes(' Lab')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Lab\s*$/, '').trim();
        if (!component) component = 'Lab';
      } else if (cls.catalogNumber.includes(' Discussion')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Discussion\s*$/, '').trim();
        if (!component) component = 'Discussion';
      } else if (cls.catalogNumber.includes(' Recitation')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Recitation\s*$/, '').trim();
        if (!component) component = 'Recitation';
      } else if (cls.catalogNumber.includes(' Seminar')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Seminar\s*$/, '').trim();
        if (!component) component = 'Seminar';
      } else if (cls.catalogNumber.includes(' Tutorial')) {
        cleanCatalogNumber = cls.catalogNumber.replace(/\s*Tutorial\s*$/, '').trim();
        if (!component) component = 'Tutorial';
      }
      
      // Find course by matching subject and catalogNumber (component is separate)
      const course = courses.find((c) => {
        let cCleanCatalogNumber = c.catalogNumber;
        // Extract component from course catalogNumber if present
        if (c.catalogNumber.includes(' Laboratory')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Laboratory\s*$/, '').trim();
        } else if (c.catalogNumber.includes(' Lab')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Lab\s*$/, '').trim();
        } else if (c.catalogNumber.includes(' Discussion')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Discussion\s*$/, '').trim();
        } else if (c.catalogNumber.includes(' Recitation')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Recitation\s*$/, '').trim();
        } else if (c.catalogNumber.includes(' Seminar')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Seminar\s*$/, '').trim();
        } else if (c.catalogNumber.includes(' Tutorial')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Tutorial\s*$/, '').trim();
        }
        return c.subject === cls.subject && cCleanCatalogNumber === cleanCatalogNumber;
      });
      
      if (!course) {
        console.warn(`Course not found for ${cls.subject} ${cleanCatalogNumber}`);
        return null;
      }
      
      const actualClass = course.classes.find((c) => c.classNumber === cls.classNumber);
      
      if (!actualClass) {
        console.warn(
          `Class ${cls.classNumber} not found in ${cls.subject} ${cleanCatalogNumber}, using first available class`,
        );
        if (course.classes.length > 0) {
          const fallbackClass = course.classes[0];
          return mapToFullClassData({
            subject: fallbackClass.subject,
            catalogNumber: cleanCatalogNumber,
            component: component,
            classNumber: fallbackClass.classNumber,
            times: cls.times || '',
          } as ScheduleClass);
        }
        return null;
      }
      
      // Also clean actualClass.catalogNumber if it has component info
      let actualClassCatalogNumber = actualClass.catalogNumber;
      if (actualClassCatalogNumber.includes(' Laboratory')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Laboratory\s*$/, '').trim();
      } else if (actualClassCatalogNumber.includes(' Lab')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Lab\s*$/, '').trim();
      } else if (actualClassCatalogNumber.includes(' Discussion')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Discussion\s*$/, '').trim();
      } else if (actualClassCatalogNumber.includes(' Recitation')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Recitation\s*$/, '').trim();
      } else if (actualClassCatalogNumber.includes(' Seminar')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Seminar\s*$/, '').trim();
      } else if (actualClassCatalogNumber.includes(' Tutorial')) {
        actualClassCatalogNumber = actualClassCatalogNumber.replace(/\s*Tutorial\s*$/, '').trim();
      }
      
      // Use the cleaned catalogNumber (prefer the one from cls if it was cleaned, otherwise use actualClass)
      const finalCatalogNumber = cleanCatalogNumber || actualClassCatalogNumber;
      
      // Use times from response if available, otherwise extract from actualClass
      let days = '';
      let times = '';
      let location = '';
      let instructor = '';
      
      // If response includes times, use them (they should include days)
      if (cls.times && cls.times !== 'TBA' && cls.times.trim() !== '') {
        // Parse times string - could be "MWF 9:40 AM-10:35 AM" or just "9:40 AM-10:35 AM"
        const timeStr = cls.times.trim();
        // Convert to AM/PM format if needed
        const convertedTimeStr = convertTimeRangeTo12Hour(timeStr);
        const dayPattern = /^((?:M|Tu|W|Th|F|S)+)\s+(.+)$/i;
        const match = convertedTimeStr.match(dayPattern);
        if (match) {
          days = match[1];
          times = match[2];
        } else {
          times = convertedTimeStr;
        }
      }
      
      // Fallback to extracting from actualClass if not in response
      if (!times || !days) {
        if (actualClass.meetings && actualClass.meetings.length > 0) {
          const meeting = actualClass.meetings[0];
          if (meeting.days && Array.isArray(meeting.days)) {
            if (!days) days = meeting.days.join('');
          }
          if (meeting.startTime && meeting.endTime && 
              typeof meeting.startTime === 'string' && 
              typeof meeting.endTime === 'string' &&
              meeting.startTime.trim() !== '' &&
              meeting.endTime.trim() !== '') {
            if (!times) {
              // Convert to AM/PM format
              const start12 = convertTo12Hour(meeting.startTime);
              const end12 = convertTo12Hour(meeting.endTime);
              times = `${start12}-${end12}`;
            }
          }
          if (meeting.roomAndBuilding) {
            location = meeting.roomAndBuilding;
          }
        }
        
        // Fallback to direct fields
        if (!days && actualClass.days) {
          days = actualClass.days;
        }
        if (!times && actualClass.times && actualClass.times !== 'TBA') {
          // Convert to AM/PM format if needed
          times = convertTimeRangeTo12Hour(actualClass.times);
        }
      }
      
      if (!location) {
        location = actualClass.location || actualClass.building || '';
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
      
      // Get component from actualClass if not already set
      if (!component) {
        component = (actualClass as any).component || actualClass.instructionType || '';
      }
      
      // Ensure times are in AM/PM format
      const formattedTimes = times && times !== 'TBA' ? convertTimeRangeTo12Hour(times) : times;
      const combinedTimes = days && formattedTimes && formattedTimes !== 'TBA' 
        ? `${days} ${formattedTimes}` 
        : formattedTimes || (days ? days : 'TBA');
      
      return {
        subject: actualClass.subject,
        catalogNumber: finalCatalogNumber,
        component: component,
        classNumber: actualClass.classNumber,
        title: actualClass.title,
        minCreditHours: actualClass.minCreditHours,
        maxCreditHours: actualClass.maxCreditHours,
        department: actualClass.department,
        college: actualClass.college,
        section: actualClass.section || '',
        instructionType: actualClass.instructionType || '',
        instructor: instructor,
        days: days,
        times: combinedTimes,
        location: location || actualClass.building || '',
        building: actualClass.building || '',
        room: actualClass.room || '',
      };
    };
    
    // Enrich schedules with full class data
    const enrichedSchedules: Schedule[] = schedules.map((schedule) => {
      const enrichedClasses = schedule.classes
        .map(mapToFullClassData)
        .filter((cls): cls is ScheduleClass => cls !== null);
      
      return {
        ...schedule,
        classes: enrichedClasses,
      };
    });
    
    console.log('Final enriched schedules:', JSON.stringify(enrichedSchedules, null, 2));
    
    return enrichedSchedules;
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate schedules with OpenRouter API');
  }
}

