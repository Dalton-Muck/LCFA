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
    classNumber: number;
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
      
      if (!timeString) {
        console.error('Class missing time data:', cls);
        throw new Error(`Class ${cls.subject} ${cls.catalogNumber} #${cls.classNumber} is missing required time information`);
      }
      
      const scheduleTime = daysString && timeString 
        ? `${daysString} ${timeString}` 
        : timeString;
      
      const seats = cls.enrolled !== undefined && cls.maxEnrolled !== undefined
        ? `${cls.enrolled}/${cls.maxEnrolled}`
        : cls.capacity
        ? `${cls.capacity} capacity`
        : '';
      
      return {
        classNumber: cls.classNumber,
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

  // Build previous schedule reference text if provided
  let previousScheduleText = '';
  if (previousSchedule && previousSchedule.classes) {
    previousScheduleText = `

PREVIOUS SCHEDULE REFERENCE:
The user has provided a previous schedule (${previousSchedule.name}) that they want to match as closely as possible.
Your goal is to generate schedules that are SIMILAR to this previous schedule, especially matching the TIME SLOTS.

Previous Schedule Details:
${previousSchedule.classes.map((cls, idx) => 
  `${idx + 1}. ${cls.subject} ${cls.catalogNumber} - Class #${cls.classNumber} - Time: ${cls.timeRange}`
).join('\n')}

CRITICAL: When generating schedules, prioritize selecting classes that have SIMILAR or IDENTICAL times to the previous schedule.
- If a course in the previous schedule had "M/W/F 9:40 AM–10:35 AM", try to find classes with similar times (M/W/F around 9:40-10:35)
- Match the DAYS as closely as possible (if previous was M/W/F, prefer M/W/F classes)
- Match the TIME RANGE as closely as possible
- If exact matches aren't possible due to conflicts, choose the closest available times
- The FIRST schedule you generate should be the MOST SIMILAR to the previous schedule
- Subsequent schedules can vary more, but still try to maintain some similarity where possible

This is a HIGH PRIORITY requirement - the user specifically wants schedules similar to their previous one.`;
  }

  const prompt = `You are a course schedule generator. Given ${courses.length} courses, generate conflict-free schedules.${previousScheduleText}

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
${previousSchedule ? `
1. Start with Schedule 1: This is CRITICAL - make this the MOST SIMILAR to the previous schedule. For each course, try to find a class with times that match or are very close to the previous schedule's times. Prioritize matching days and time ranges. Ensure NO time conflicts between classes from different courses.
2. Move to Schedule 2: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options, but still try to maintain some similarity to previous schedule times where possible. Check for conflicts.
3. Move to Schedule 3: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
4. Move to Schedule 4: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
5. Move to Schedule 5: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
` : `
1. Start with Schedule 1: Pick one class from each course, ensuring NO time conflicts between classes from different courses
2. Move to Schedule 2: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
3. Move to Schedule 3: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
4. Move to Schedule 4: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
5. Move to Schedule 5: Keep the same classes from courses with only 1 option. Vary classes from courses with multiple options. Check for conflicts.
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
      const course = courses.find(
        (c) => c.subject === cls.subject && c.catalogNumber === cls.catalogNumber
      );
      
      if (!course) {
        console.warn(`Course not found for ${cls.subject} ${cls.catalogNumber}`);
        return null;
      }
      
      const actualClass = course.classes.find((c) => c.classNumber === cls.classNumber);
      
      if (!actualClass) {
        console.warn(
          `Class ${cls.classNumber} not found in ${cls.subject} ${cls.catalogNumber}, using first available class`,
        );
        if (course.classes.length > 0) {
          const fallbackClass = course.classes[0];
          return mapToFullClassData({
            subject: fallbackClass.subject,
            catalogNumber: fallbackClass.catalogNumber,
            classNumber: fallbackClass.classNumber,
          } as ScheduleClass);
        }
        return null;
      }
      
      // Extract raw meeting information
      let days = '';
      let times = '';
      let location = '';
      let instructor = '';
      
      if (actualClass.meetings && actualClass.meetings.length > 0) {
        const meeting = actualClass.meetings[0];
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
      if (!days && actualClass.days) {
        days = actualClass.days;
      }
      if (!times && actualClass.times && actualClass.times !== 'TBA') {
        times = actualClass.times;
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
      
      const combinedTimes = days && times && times !== 'TBA' 
        ? `${days} ${times}` 
        : times || (days ? days : 'TBA');
      
      return {
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

