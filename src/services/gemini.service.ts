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
 * Handles formats like "09:40-10:35" or "MWF 09:40-10:35" or "Th 9:30 AM-10:25 AM; MWF 9:40 AM-10:35 AM"
 */
function convertTimeRangeTo12Hour(timeRange: string): string {
  if (!timeRange || typeof timeRange !== 'string') return timeRange;
  
  // Check if already in AM/PM format
  if (timeRange.includes('AM') || timeRange.includes('PM') || timeRange.includes('am') || timeRange.includes('pm')) {
    return timeRange;
  }
  
  // Handle multiple meeting times separated by semicolons
  if (timeRange.includes(';')) {
    return timeRange.split(';').map(part => convertTimeRangeTo12Hour(part.trim())).join('; ');
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
      // Extract raw time information from meetings array - handle multiple meetings
      let timeString = '';
      let daysString = '';
      
      if (cls.meetings && cls.meetings.length > 0) {
        // Process all meetings, not just the first one
        const meetingStrings: string[] = [];
        const allDays = new Set<string>();
        
        for (const meeting of cls.meetings) {
        if (meeting.startTime && meeting.endTime && 
            typeof meeting.startTime === 'string' && 
            typeof meeting.endTime === 'string' &&
            meeting.startTime.trim() !== '' &&
            meeting.endTime.trim() !== '') {
            // Convert to AM/PM format
            const start12 = convertTo12Hour(meeting.startTime);
            const end12 = convertTo12Hour(meeting.endTime);
            const timeRange = `${start12}-${end12}`;
            
            if (meeting.days && Array.isArray(meeting.days) && meeting.days.length > 0) {
              const meetingDays = meeting.days.join('');
              meetingStrings.push(`${meetingDays} ${timeRange}`);
              meeting.days.forEach(day => allDays.add(day));
            } else {
              meetingStrings.push(timeRange);
            }
          }
        }
        
        if (meetingStrings.length > 0) {
          timeString = meetingStrings.join('; ');
          daysString = Array.from(allDays).join('');
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
        throw new Error(`Class ${cls.subject} ${cleanCatalogNumber} #${cls.classNumber} is missing required time information`);
      }
      
      // If we have multiple meeting times, timeString already includes days
      // If we have single time with days, combine them
      const scheduleTime = (timeString.includes(';') || !daysString) 
        ? timeString 
        : `${daysString} ${timeString}`;
      
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

  // Build system prompt
  const systemPrompt = `You are an advising assistant that generates conflict-free course schedules. Your objective is to schedule 1 class from each course, matching historical times when available. Rules: - Generate the MAXIMUM number of unique schedules possible (up to 8, but fewer if that's all that's possible) - If a class matches historical data exactly, you MUST use that class in ALL schedules (never change it) - If more then 8 schedules are possible try to make the 8 schedules as unique as possible. - Select exactly ONE class from EACH course - CRITICAL: Every schedule MUST be UNIQUE - no two schedules can have the exact same set of classNumbers - To ensure uniqueness: Before adding a schedule, check that its classNumbers differ from ALL previous schedules - If you cannot create a unique schedule, DO NOT add it - return only the unique schedules you can create - NO time conflicts between classes from different courses - TIME MATCHING PRIORITY (when no exact match exists): 1. EXACT MATCH: Same days AND same time (e.g., historical "TuTh 1:00 PM" matches "TuTh 1:00 PM") - MANDATORY if available 2. SAME DAYS, CLOSEST TIME: Match days first, then closest time (e.g., historical "TuTh 1:00 PM" → prefer "TuTh 12:00 PM" over "TuTh 10:00 AM" over "MWF 1:00 PM") 3. DIFFERENT DAYS, CLOSEST TIME: If no same-day match, use closest time regardless of days Example: If historical was "TuTh 1:00 PM" and options are "TuTh 12:00 PM", "TuTh 10:00 AM", "MWF 1:00 PM" → choose "TuTh 12:00 PM" (same days, closest time) - MULTIPLE MEETING TIMES: Some classes meet at different times on different days (e.g., "MWF 10:45 AM-11:40 AM; Th 11:00 AM-11:55 AM") - When checking conflicts, check ALL meeting times - a conflict exists if ANY meeting time overlaps - When matching historical data, match if ANY meeting time matches (prefer exact matches across all times) - Courses with different components (Lecture, Lab, Discussion) are separate courses - Times must be in 12-hour AM/PM format (e.g., "9:40 AM-10:35 AM") - Return ONLY valid JSON array of schedules - return exactly as many unique schedules as possible, not always 5`;

  // Build few-shot example
  const fewShotExampleUser = `Generate a schedule using these available courses: [{"subject": "CS", "catalogNumber": "2300", "component": "Lecture", "classes": [{"classNumber": 1259, "times": "MWF 9:40 AM-10:35 AM", "seats": "43/72"}]}, {"subject": "CS", "catalogNumber": "2300", "component": "Lab", "classes": [{"classNumber": 1270, "times": "F 2:00 PM-3:50 PM", "seats": "14/24"}, {"classNumber": 1229, "times": "W 5:15 PM-7:05 PM", "seats": "9/24"}, {"classNumber": 1260, "times": "W 3:05 PM-4:55 PM", "seats": "20/24"}]}, {"subject": "EE", "catalogNumber": "1024", "component": "Lecture", "classes": [{"classNumber": 1139, "times": "MWF 12:55 PM-1:50 PM", "seats": "56/144"}]}, {"subject": "EE", "catalogNumber": "1024", "component": "Lab", "classes": [{"classNumber": 1140, "times": "W 2:00 PM-3:50 PM", "seats": "14/20"}, {"classNumber": 1141, "times": "Th 3:05 PM-4:55 PM", "seats": "20/20"}]}, {"subject": "ET", "catalogNumber": "2905", "component": "Lecture", "classes": [{"classNumber": 1549, "times": "TuTh 12:30 PM-1:50 PM", "seats": "153/200"}, {"classNumber": 1550, "times": "TuTh 2:00 PM-3:20 PM", "seats": "177/180"}]}] and this historical data: 1. CS 2300 (Lecture) - Time: M W F 9:40 AM - 10:35 AM 2. CS 2300 (Lab) - Time: W 5:15 PM - 7:05 PM 3. EE 1024 (Lecture) - Time: M W F 12:55 PM - 1:50 PM 4. EE 1024 (Lab) - Time: Th 3:05 PM - 4:55 PM 5. ET 2905 (Lecture) - Time: Tu Th 9:30 AM - 10:50 AM`;

  const fewShotExampleAssistant = `[{"scheduleNumber": 1, "classes": [{"subject": "CS", "catalogNumber": "2300", "component": "Lecture", "classNumber": 1259, "times": "MWF 9:40 AM-10:35 AM"}, {"subject": "CS", "catalogNumber": "2300", "component": "Lab", "classNumber": 1229, "times": "W 5:15 PM-7:05 PM"}, {"subject": "EE", "catalogNumber": "1024", "component": "Lecture", "classNumber": 1139, "times": "MWF 12:55 PM-1:50 PM"}, {"subject": "EE", "catalogNumber": "1024", "component": "Lab", "classNumber": 1141, "times": "Th 3:05 PM-4:55 PM"}, {"subject": "ET", "catalogNumber": "2905", "component": "Lecture", "classNumber": 1549, "times": "TuTh 12:30 PM-1:50 PM"}]}]`;

  // Build actual user request
  let historicalDataText = '';
  if (previousSchedule && previousSchedule.classes) {
    historicalDataText = ` and this historical data: ${previousSchedule.classes.map((cls, idx) => 
      `${idx + 1}. ${cls.subject} ${cls.catalogNumber}${cls.component ? ` (${cls.component})` : ''} - Time: ${cls.timeRange}`
    ).join(' ')}`;
  }

  const actualUserRequest = `Generate a schedule using these available courses: ${JSON.stringify(courseInfo)}${historicalDataText}`;

  // Log what we're sending to OpenRouter
  console.log('='.repeat(80));
  console.log('SENDING TO OPENROUTER:');
  console.log('='.repeat(80));
  console.log('Model:', DEFAULT_MODEL);
  console.log('API URL:', OPENROUTER_API_URL);
  console.log('\nCourse Information:');
  console.log(JSON.stringify(courseInfo, null, 2));
  console.log('\nMessages:');
  
  // Format messages for better readability
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: fewShotExampleUser },
    { role: 'assistant', content: fewShotExampleAssistant },
    { role: 'user', content: actualUserRequest },
  ];
  
  messages.forEach((msg, index) => {
    console.log(`\n[${index + 1}] ${msg.role.toUpperCase()}:`);
    let content = msg.content;
    
    // For user messages, try to parse and format the JSON courses array
    if (msg.role === 'user' && content.includes('Generate a schedule using these available courses:')) {
      const parts = content.split(' and this historical data:');
      const coursesPart = parts[0].replace('Generate a schedule using these available courses:', '').trim();
      
      // Try to parse the courses JSON
      try {
        const parsedCourses = JSON.parse(coursesPart);
        console.log('Courses:', JSON.stringify(parsedCourses, null, 2));
        if (parts[1]) {
          console.log('Historical data:', parts[1].trim());
        }
        return;
      } catch (e) {
        // If parsing fails, try to find JSON array in the content
        const jsonMatch = coursesPart.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsedCourses = JSON.parse(jsonMatch[0]);
            console.log('Courses:', JSON.stringify(parsedCourses, null, 2));
            if (parts[1]) {
              console.log('Historical data:', parts[1].trim());
            }
            return;
          } catch (e2) {
            // Fall through
          }
        }
      }
    }
    
    // For assistant messages, try to parse and format the JSON response
    if (msg.role === 'assistant') {
      try {
        const parsedResponse = JSON.parse(content);
        console.log(JSON.stringify(parsedResponse, null, 2));
        return;
      } catch (e) {
        // If not valid JSON, try to find JSON array
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsedJson = JSON.parse(jsonMatch[0]);
            console.log(JSON.stringify(parsedJson, null, 2));
            return;
          } catch (e2) {
            // Fall through
          }
        }
      }
    }
    
    // For system messages or if parsing fails, show as-is
    console.log(content);
  });
  console.log('='.repeat(80));

  const requestBody = {
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: fewShotExampleUser,
      },
      {
        role: 'assistant',
        content: fewShotExampleAssistant,
      },
      {
        role: 'user',
        content: actualUserRequest,
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
    
    // Check if response is an error message
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
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

    // Filter out duplicate schedules - a schedule is unique if its set of classNumbers is different
    const uniqueSchedules: Schedule[] = [];
    const seenClassNumberSets = new Set<string>();
    
    for (const schedule of schedules) {
      if (!schedule.classes || !Array.isArray(schedule.classes)) {
        continue;
      }
      
      // Create a unique key from sorted classNumbers
      const classNumbers = schedule.classes
        .map(cls => cls.classNumber)
        .sort((a, b) => a - b)
        .join(',');
      
      if (!seenClassNumberSets.has(classNumbers)) {
        seenClassNumberSets.add(classNumbers);
        uniqueSchedules.push(schedule);
      }
    }
    
    // Renumber schedules sequentially
    const finalSchedules = uniqueSchedules.map((schedule, index) => ({
      ...schedule,
      scheduleNumber: index + 1,
    }));
    
    const schedulesToUse = finalSchedules;
    
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
      
      // Find course by matching subject, catalogNumber, and component
      const course = courses.find((c) => {
        let cCleanCatalogNumber = c.catalogNumber;
        let cComponent = c.component || '';
        
        // Extract component from course catalogNumber if present
        if (c.catalogNumber.includes(' Laboratory')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Laboratory\s*$/, '').trim();
          if (!cComponent) cComponent = 'Lab';
        } else if (c.catalogNumber.includes(' Lab')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Lab\s*$/, '').trim();
          if (!cComponent) cComponent = 'Lab';
        } else if (c.catalogNumber.includes(' Discussion')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Discussion\s*$/, '').trim();
          if (!cComponent) cComponent = 'Discussion';
        } else if (c.catalogNumber.includes(' Recitation')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Recitation\s*$/, '').trim();
          if (!cComponent) cComponent = 'Recitation';
        } else if (c.catalogNumber.includes(' Seminar')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Seminar\s*$/, '').trim();
          if (!cComponent) cComponent = 'Seminar';
        } else if (c.catalogNumber.includes(' Tutorial')) {
          cCleanCatalogNumber = c.catalogNumber.replace(/\s*Tutorial\s*$/, '').trim();
          if (!cComponent) cComponent = 'Tutorial';
        }
        
        // Normalize components for comparison
        const normalizeComponent = (comp: string): string => {
          const normalized = comp.toLowerCase().trim();
          if (normalized === 'lec' || normalized === 'lecture') return 'lecture';
          if (normalized === 'lab' || normalized === 'laboratory') return 'lab';
          return normalized;
        };
        
        const clsComponentNormalized = normalizeComponent(component);
        const cComponentNormalized = normalizeComponent(cComponent);
        
        // Match by subject, catalogNumber, and component
        return c.subject === cls.subject && 
               cCleanCatalogNumber === cleanCatalogNumber &&
               (clsComponentNormalized === cComponentNormalized || 
                (clsComponentNormalized === '' && cComponentNormalized === 'lecture') ||
                (clsComponentNormalized === 'lecture' && cComponentNormalized === ''));
      });
      
      if (!course) {
        return null;
      }
      
      const actualClass = course.classes.find((c) => c.classNumber === cls.classNumber);
      
      if (!actualClass) {
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
        const timeStr = cls.times.trim();
        
        // If times contains semicolons, it's multiple meeting times with days already included
        // Don't extract days from the beginning - each meeting time has its own days
        if (timeStr.includes(';')) {
          // Multiple meeting times like "Th 9:30 AM-10:25 AM; MWF 9:40 AM-10:35 AM"
          // Normalize: remove spaces between days (e.g., "M W F" -> "MWF")
          const normalizedParts = timeStr.split(';').map(part => {
            const trimmed = part.trim();
            // Pattern to match days with spaces (e.g., "M W F 10:45 AM-11:40 AM")
            const dayPattern = /^((?:M|Tu|W|Th|F|S)\s+(?:M|Tu|W|Th|F|S|\s)*)\s+(.+)$/i;
            const match = trimmed.match(dayPattern);
            if (match) {
              // Remove spaces from days
              const days = match[1].replace(/\s+/g, '');
              const timePart = match[2].trim();
              return `${days} ${timePart}`;
            }
            return trimmed;
          });
          times = convertTimeRangeTo12Hour(normalizedParts.join('; '));
          // Don't set days - they're already in the times string
        } else {
          // Single meeting time - could be "MWF 9:40 AM-10:35 AM" or just "9:40 AM-10:35 AM"
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
      }
      
      // Fallback to extracting from actualClass if not in response
      if (!times || !days) {
        if (actualClass.meetings && actualClass.meetings.length > 0) {
          // Handle multiple meetings (e.g., MWF at one time, Th at another)
          const meetingStrings: string[] = [];
          const allDays = new Set<string>();
          
          for (const meeting of actualClass.meetings) {
        if (meeting.startTime && meeting.endTime && 
            typeof meeting.startTime === 'string' && 
            typeof meeting.endTime === 'string' &&
            meeting.startTime.trim() !== '' &&
            meeting.endTime.trim() !== '') {
              // Convert to AM/PM format
              const start12 = convertTo12Hour(meeting.startTime);
              const end12 = convertTo12Hour(meeting.endTime);
              const timeRange = `${start12}-${end12}`;
              
              if (meeting.days && Array.isArray(meeting.days) && meeting.days.length > 0) {
                const meetingDays = meeting.days.join('');
                meetingStrings.push(`${meetingDays} ${timeRange}`);
                meeting.days.forEach(day => allDays.add(day));
              } else {
                meetingStrings.push(timeRange);
              }
            }
            if (meeting.roomAndBuilding && !location) {
          location = meeting.roomAndBuilding;
            }
          }
          
          if (meetingStrings.length > 0 && !times) {
            times = meetingStrings.join('; ');
          }
          if (allDays.size > 0 && !days) {
            days = Array.from(allDays).join('');
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
      // If times already includes multiple meeting times (with semicolons), use as-is
      // Otherwise, combine with days
      let formattedTimes = times && times !== 'TBA' ? convertTimeRangeTo12Hour(times) : times;
      
      // Check if formattedTimes already starts with day patterns (e.g., "TuTh 12:30 PM-1:50 PM")
      const dayPattern = /^((?:M|Tu|W|Th|F|S)+)\s+(.+)$/i;
      const timesHasDays = formattedTimes && formattedTimes !== 'TBA' ? formattedTimes.match(dayPattern) : null;
      
      // If times contains semicolons, it already has days included for each meeting
      // Don't add a redundant days prefix - each meeting time has its own days
      // Otherwise, check if times already has days before adding them
      const combinedTimes = formattedTimes && formattedTimes !== 'TBA'
        ? (formattedTimes.includes(';') || !days || timesHasDays)
          ? formattedTimes
          : `${days} ${formattedTimes}`
        : (days ? days : 'TBA');
      
      // For days field: if we have multiple meeting times, don't set days (they're in times)
      // Otherwise, set days if available
      const finalDays = formattedTimes && formattedTimes.includes(';') ? '' : days;
      
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
        days: finalDays,
        times: combinedTimes,
        location: location || actualClass.building || '',
        building: actualClass.building || '',
        room: actualClass.room || '',
      };
    };
    
    // Enrich schedules with full class data
    const enrichedSchedules: Schedule[] = schedulesToUse.map((schedule) => {
      const enrichedClasses = schedule.classes
        .map(mapToFullClassData)
        .filter((cls): cls is ScheduleClass => cls !== null);
      
      return {
        ...schedule,
        classes: enrichedClasses,
      };
    });
    
    return enrichedSchedules;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate schedules with OpenRouter API');
  }
}


