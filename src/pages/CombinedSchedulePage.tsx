import { useState, useEffect, useRef } from 'react';
import { CourseSearch } from '../components/CourseSearch';
import { generateSchedules, type Schedule } from '../services/gemini.service';
import { ScheduleCard } from '../components/ScheduleCard';
import type { Course, ClassResult } from '../types/course-offerings';
import { environment } from '../config/environment';
import type { PreviousSchedule } from '../data/previousSchedules';
import { getCurrentFallTerm, searchClasses } from '../services/course-offerings.service';
import { CommunitySelector } from '../components/CommunitySelector';
import type { ClusteredCommunity } from '../types/clustered-classes';
import { organizeByCollege } from '../utils/community-parser';
import clusteredClassesData from '../data/clustered_classes.json';
import './CombinedSchedulePage.css';

// No maximum course limit

export function CombinedSchedulePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  // Map from courseKey (e.g., "COMS-1030") to Set of selected class numbers
  const [courseSelections, setCourseSelections] = useState<Map<string, Set<number>>>(new Map());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreviousSchedule, setSelectedPreviousSchedule] = useState<PreviousSchedule | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<ClusteredCommunity | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Organize clustered classes data (filters out UC 1900 classes)
  const collegeGroups = organizeByCollege(
    clusteredClassesData as ClusteredCommunity[]
  );

  // Helper to get course key
  const getCourseKey = (subject: string, catalogNumber: string): string => {
    return `${subject}-${catalogNumber}`;
  };

  // Helper to check if a class is selected
  const isClassSelected = (courseKey: string, classNumber: number): boolean => {
    const selection = courseSelections.get(courseKey);
    return selection ? selection.has(classNumber) : false;
  };

  // Helper to get selected classes for a course
  const getSelectedClassesForCourse = (courseKey: string): Set<number> => {
    return courseSelections.get(courseKey) || new Set();
  };

  // Helper to get total count of selected classes across all courses
  const getTotalSelectedClassesCount = (): number => {
    let count = 0;
    courseSelections.forEach((selectedSet) => {
      count += selectedSet.size;
    });
    return count;
  };

  // Load courses and selected classes from localStorage on mount
  useEffect(() => {
    const savedCourses = localStorage.getItem('selectedCourses');
    if (savedCourses) {
      try {
        const parsed = JSON.parse(savedCourses);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCourses(parsed);
          
          // Load saved course selections
          const savedSelections = localStorage.getItem('courseSelections');
          const newSelections = new Map<string, Set<number>>();
          
          if (savedSelections) {
            try {
              const selectionsObj: Record<string, number[]> = JSON.parse(savedSelections);
              parsed.forEach((course: Course) => {
                const courseKey = getCourseKey(course.subject, course.catalogNumber);
                const savedSelection = selectionsObj[courseKey];
                if (savedSelection && Array.isArray(savedSelection)) {
                  // Only include class numbers that still exist in the course
                  const validClassNumbers = new Set<number>();
                  savedSelection.forEach((classNum) => {
                    if (course.classes.some((cls) => cls.classNumber === classNum)) {
                      validClassNumbers.add(classNum);
                    }
                  });
                  newSelections.set(courseKey, validClassNumbers);
                } else {
                  // Auto-select all classes if no saved selection
                  const selectedSet = new Set<number>();
                  course.classes.forEach((cls) => {
                    selectedSet.add(cls.classNumber);
                  });
                  newSelections.set(courseKey, selectedSet);
                }
              });
            } catch (e) {
              // Fallback to auto-select all
              parsed.forEach((course: Course) => {
                const courseKey = getCourseKey(course.subject, course.catalogNumber);
                const selectedSet = new Set<number>();
                course.classes.forEach((cls) => {
                  selectedSet.add(cls.classNumber);
                });
                newSelections.set(courseKey, selectedSet);
              });
            }
          } else {
            // Auto-select all classes when courses are loaded for the first time
            parsed.forEach((course: Course) => {
              const courseKey = getCourseKey(course.subject, course.catalogNumber);
              const selectedSet = new Set<number>();
              course.classes.forEach((cls) => {
                selectedSet.add(cls.classNumber);
              });
              newSelections.set(courseKey, selectedSet);
            });
          }
          
          setCourseSelections(newSelections);
        }
      } catch (e) {
        // Failed to parse saved courses
      }
    }

    // Load schedules
    const savedSchedulesJson = localStorage.getItem('generatedSchedules');
    if (savedSchedulesJson) {
      try {
        const parsed = JSON.parse(savedSchedulesJson);
        if (Array.isArray(parsed)) {
          setSchedules(parsed);
        }
      } catch (e) {
        // Failed to parse saved schedules
      }
    }

    // Load generation state
    const savedGenerating = localStorage.getItem('isGeneratingSchedules');
    if (savedGenerating === 'true' && savedSchedulesJson) {
      localStorage.removeItem('isGeneratingSchedules');
      setIsGenerating(false);
    } else if (savedGenerating === 'true') {
      setIsGenerating(true);
    }

    // Load error state
    const savedError = localStorage.getItem('scheduleGenerationError');
    if (savedError) {
      try {
        setError(JSON.parse(savedError));
      } catch (e) {
        setError(savedError);
      }
    }
  }, []);

  // Save courses to localStorage
  useEffect(() => {
    if (courses.length > 0) {
      localStorage.setItem('selectedCourses', JSON.stringify(courses));
    }
  }, [courses]);

  // Save course selections to localStorage
  useEffect(() => {
    if (courseSelections.size > 0) {
      // Convert Map to serializable format
      const selectionsObj: Record<string, number[]> = {};
      courseSelections.forEach((selectedSet, courseKey) => {
        selectionsObj[courseKey] = Array.from(selectedSet);
      });
      localStorage.setItem('courseSelections', JSON.stringify(selectionsObj));
    } else {
      localStorage.removeItem('courseSelections');
    }
  }, [courseSelections]);

  // Save schedules to localStorage
  useEffect(() => {
    if (schedules.length > 0) {
      localStorage.setItem('generatedSchedules', JSON.stringify(schedules));
      localStorage.removeItem('isGeneratingSchedules');
    }
  }, [schedules]);

  // Save generation state
  useEffect(() => {
    if (isGenerating) {
      localStorage.setItem('isGeneratingSchedules', 'true');
    } else {
      localStorage.removeItem('isGeneratingSchedules');
    }
  }, [isGenerating]);

  // Save error
  useEffect(() => {
    if (error) {
      localStorage.setItem('scheduleGenerationError', JSON.stringify(error));
    } else {
      localStorage.removeItem('scheduleGenerationError');
    }
  }, [error]);

  const handleCourseAdd = (course: Course) => {
    // Separate lecture and lab classes
    const lectureClasses = course.classes.filter((cls) => {
      const component = (cls as any).component || cls.instructionType || '';
      return component === 'LEC' || component === 'Lecture' || component.toLowerCase() === 'lecture';
    });
    
    const labClasses = course.classes.filter((cls) => {
      const component = (cls as any).component || cls.instructionType || '';
      return component === 'LAB' || component === 'Laboratory' || component.toLowerCase() === 'laboratory' || component.toLowerCase() === 'lab';
    });
    
    const newCourses = [...courses];
    const newSelections = new Map(courseSelections);
    const newExpanded = new Set(expandedCourses);
    
    // Add lecture course if there are lecture classes
    if (lectureClasses.length > 0) {
      const lectureCourse: Course = {
        subject: course.subject,
        catalogNumber: course.catalogNumber,
        component: 'Lecture',
        title: course.title,
        classes: lectureClasses,
      };
      
      const exists = courses.some(
        (c) => c.subject === lectureCourse.subject && c.catalogNumber === lectureCourse.catalogNumber,
      );
      
      if (!exists) {
        newCourses.push(lectureCourse);
        const courseKey = getCourseKey(lectureCourse.subject, lectureCourse.catalogNumber);
        const selectedSet = new Set<number>();
        lectureClasses.forEach((cls) => {
          selectedSet.add(cls.classNumber);
        });
        newSelections.set(courseKey, selectedSet);
        newExpanded.add(courseKey);
      }
    }
    
    // Add lab course if there are lab classes
    if (labClasses.length > 0) {
      // Keep catalogNumber clean, use component field to distinguish
      const labCatalogNumber = `${course.catalogNumber} Lab`; // For UI display/distinction
      const labCourse: Course = {
        subject: course.subject,
        catalogNumber: labCatalogNumber, // Keep with suffix for UI, but component will be extracted when sending to model
        component: 'Lab',
        title: `${course.title} (Lab)`,
        classes: labClasses,
      };
      
      const exists = courses.some(
        (c) => c.subject === labCourse.subject && c.catalogNumber === labCourse.catalogNumber,
      );
      
      if (!exists) {
        newCourses.push(labCourse);
        const courseKey = getCourseKey(labCourse.subject, labCourse.catalogNumber);
        const selectedSet = new Set<number>();
        labClasses.forEach((cls) => {
          selectedSet.add(cls.classNumber);
        });
        newSelections.set(courseKey, selectedSet);
        newExpanded.add(courseKey);
      }
    }
    
    // Check if any courses were added
    if (newCourses.length === courses.length) {
      alert(`${course.subject} ${course.catalogNumber} is already in your list.`);
      return;
    }
    
    setCourses(newCourses);
    setCourseSelections(newSelections);
    setExpandedCourses(newExpanded);
  };
  
  const toggleCourseExpansion = (courseKey: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseKey)) {
      newExpanded.delete(courseKey);
    } else {
      newExpanded.add(courseKey);
    }
    setExpandedCourses(newExpanded);
  };

  const handleRemoveCourse = (index: number) => {
    const courseToRemove = courses[index];
    const courseKey = getCourseKey(courseToRemove.subject, courseToRemove.catalogNumber);
    
    // Confirm before removing
    const confirmed = window.confirm(
      `Are you sure you want to remove ${courseToRemove.subject} ${courseToRemove.catalogNumber} (${courseToRemove.title})? This will also remove all selected classes for this course.`
    );
    
    if (!confirmed) {
      return;
    }
    
    // Remove course from list
    const newCourses = courses.filter((_, i) => i !== index);
    setCourses(newCourses);
    
    // Remove selection for this course
    const newSelections = new Map(courseSelections);
    newSelections.delete(courseKey);
    setCourseSelections(newSelections);
    
    // Remove from expanded courses if it was expanded
    const newExpanded = new Set(expandedCourses);
    newExpanded.delete(courseKey);
    setExpandedCourses(newExpanded);
    
    // Update localStorage
    if (newCourses.length > 0) {
      localStorage.setItem('selectedCourses', JSON.stringify(newCourses));
    } else {
      localStorage.removeItem('selectedCourses');
    }
  };

  const handleToggleClass = (courseKey: string, classNumber: number) => {
    const newSelections = new Map(courseSelections);
    const selectedSet = newSelections.get(courseKey) || new Set<number>();
    const newSelectedSet = new Set(selectedSet);
    
    if (newSelectedSet.has(classNumber)) {
      newSelectedSet.delete(classNumber);
    } else {
      newSelectedSet.add(classNumber);
    }
    
    newSelections.set(courseKey, newSelectedSet);
    setCourseSelections(newSelections);
  };

  const handleSelectAll = () => {
    const newSelections = new Map<string, Set<number>>();
    courses.forEach((course) => {
      const courseKey = getCourseKey(course.subject, course.catalogNumber);
      const selectedSet = new Set<number>();
      course.classes.forEach((cls) => {
        selectedSet.add(cls.classNumber);
      });
      newSelections.set(courseKey, selectedSet);
    });
    setCourseSelections(newSelections);
  };

  const handleDeselectAll = () => {
    setCourseSelections(new Map());
  };

  const handleToggleCourseSelection = (courseKey: string, course: Course) => {
    const newSelections = new Map(courseSelections);
    const currentSelection = newSelections.get(courseKey) || new Set<number>();
    const allSelected = course.classes.every((cls) => currentSelection.has(cls.classNumber));
    
    const newSelectedSet = new Set<number>();
    if (!allSelected) {
      // Select all classes in this course
      course.classes.forEach((cls) => {
        newSelectedSet.add(cls.classNumber);
      });
    }
    // If all selected, deselect all (newSelectedSet remains empty)
    
    newSelections.set(courseKey, newSelectedSet);
    setCourseSelections(newSelections);
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setError('Generation cancelled by user.');
    localStorage.removeItem('isGeneratingSchedules');
    localStorage.setItem('scheduleGenerationError', JSON.stringify('Generation cancelled by user.'));
  };

  const handleClearSchedules = () => {
    setSchedules([]);
    localStorage.removeItem('generatedSchedules');
    setError(null);
  };

  const handlePreviousScheduleSelect = (schedule: PreviousSchedule | null) => {
    setSelectedPreviousSchedule(schedule);
    setSelectedCommunity(null); // Clear community selection when using old schedules
    setError(null);
  };

  const handleCommunitySelect = (community: ClusteredCommunity | null) => {
    setSelectedCommunity(community);
    setSelectedPreviousSchedule(null); // Clear old schedule selection
    
    if (community) {
      // Convert community to PreviousSchedule format
      const previousSchedule: PreviousSchedule = {
        scheduleNumber: community.clusterCallNumber,
        name: `${community.communities} (${community.college.trim()})`,
        classes: community.classes.map((cls) => {
          // Format time range from meetTimeStart, meetTimeEnd, and days
          // If there are multiple meeting times, format them all
          let timeRange: string;
          if (cls.meetingTimes && cls.meetingTimes.length > 1) {
            // Multiple meeting times - format as "Days1 Start-End; Days2 Start-End"
            timeRange = cls.meetingTimes
              .map(mt => `${mt.days} ${mt.start} - ${mt.end}`)
              .join('; ');
          } else if (cls.days && cls.days.includes(';') && cls.meetTimeStart && cls.meetTimeEnd) {
            // Days has semicolon but we only have one time - use it for all day groups
            // This is a fallback case - ideally meetingTimes should be populated
            const dayGroups = cls.days.split(';').map(d => d.trim());
            timeRange = dayGroups
              .map(days => `${days} ${cls.meetTimeStart} - ${cls.meetTimeEnd}`)
              .join('; ');
          } else {
            // Single meeting time
            timeRange = `${cls.days} ${cls.meetTimeStart} - ${cls.meetTimeEnd}`;
          }
          return {
            subject: cls.subject,
            catalogNumber: cls.catalogNumber,
            component: cls.component, // Include component information
            timeRange: timeRange,
          };
        }),
      };
      setSelectedPreviousSchedule(previousSchedule);
    }
    setError(null);
  };

  const handleTransferPreviousSchedule = async () => {
    if (!selectedPreviousSchedule) {
      setError('Please select a previous schedule first.');
      return;
    }

    setError(null);

    // Fetch courses for the previous schedule
    try {
      const { termCode } = await getCurrentFallTerm();
      const newCourses: Course[] = [];
      const newSelections = new Map<string, Set<number>>();
      const newExpanded = new Set<string>();

      // Get unique courses from the previous schedule
      // Group by subject-catalogNumber-component to separate labs, lectures, discussions, etc.
      const uniqueCourses = new Map<string, { subject: string; catalogNumber: string; component?: string }>();
      selectedPreviousSchedule.classes.forEach((cls) => {
        // Include component in the key to distinguish Lecture, Lab, Discussion, etc.
        const component = cls.component || '';
        const baseKey = `${cls.subject}-${cls.catalogNumber}-${component}`;
        if (!uniqueCourses.has(baseKey)) {
          uniqueCourses.set(baseKey, { 
            subject: cls.subject, 
            catalogNumber: cls.catalogNumber,
            component: component || undefined
          });
        }
      });

      // Fetch classes for each course
      // For previous schedules, we need to fetch ALL component types (LEC, LAB, Discussion, etc.)
      // and separate them into different course entries
      for (const { subject, catalogNumber, component } of uniqueCourses.values()) {
        try {
          // Get the time ranges from the previous schedule for this course and component
          const previousTimeRanges = selectedPreviousSchedule.classes
            .filter((cls) => 
              cls.subject === subject && 
              cls.catalogNumber === catalogNumber &&
              (cls.component || '') === (component || '')
            )
            .map((cls) => cls.timeRange);
          
          // Fetch all pages of classes, including LAB and other components
          const pageSize = 50;
          const allClasses: ClassResult[] = [];
          let currentPage = 1;
          let hasMore = true;
          
          while (hasMore) {
            const response = await searchClasses(
              {
                terms: [termCode],
                campuses: ['ATHN'],
                subjects: [subject],
                catalogNumber: catalogNumber,
              },
              currentPage,
              pageSize,
            );
            
            let matchingClasses = response.results.filter((cls) => {
              // Must match subject and catalog number
              if (cls.subject !== subject || cls.catalogNumber !== catalogNumber) {
                return false;
              }
              
              // Check campus - should be Athens
              const location = (cls as any).location || '';
              const isAthens = location.includes('Athens');
              
              // Must have valid time data
              let hasValidTime = false;
              if ((cls as any).meetings && Array.isArray((cls as any).meetings) && (cls as any).meetings.length > 0) {
                const meeting = (cls as any).meetings[0];
                if (meeting.startTime && meeting.endTime && 
                    typeof meeting.startTime === 'string' && 
                    typeof meeting.endTime === 'string' &&
                    meeting.startTime.trim() !== '' &&
                    meeting.endTime.trim() !== '') {
                  hasValidTime = true;
                }
              }
              if (!hasValidTime && (cls as any).times && typeof (cls as any).times === 'string' && (cls as any).times.trim() !== '' && (cls as any).times !== 'TBA') {
                hasValidTime = true;
              }
              
              // Include classes that match the component type
              const clsComponent = (cls as any).component || cls.instructionType || '';
              const normalizedClsComponent = clsComponent.toLowerCase().trim();
              const normalizedTargetComponent = (component || '').toLowerCase().trim();
              
              // Match component types generically (Lecture, Lab, Discussion, Recitation, Seminar, Tutorial, etc.)
              // Handle common variations and abbreviations
              const componentMatches = 
                normalizedTargetComponent === normalizedClsComponent ||
                (normalizedTargetComponent === 'lecture' && (normalizedClsComponent === 'lec' || normalizedClsComponent === 'lecture')) ||
                (normalizedTargetComponent === 'lab' && (normalizedClsComponent === 'lab' || normalizedClsComponent === 'laboratory')) ||
                (normalizedTargetComponent === 'discussion' && normalizedClsComponent === 'discussion') ||
                (normalizedTargetComponent === 'recitation' && normalizedClsComponent === 'recitation') ||
                (normalizedTargetComponent === 'seminar' && normalizedClsComponent === 'seminar') ||
                (normalizedTargetComponent === 'tutorial' && normalizedClsComponent === 'tutorial') ||
                (normalizedTargetComponent === 'independent study' && normalizedClsComponent === 'independent study');
              
              // If no specific component is specified, include all component types
              const includeAllComponents = !component || component.trim() === '';
              
              return isAthens && hasValidTime && (includeAllComponents || componentMatches);
            });
            
            allClasses.push(...matchingClasses);
            
            const totalCount = response.counts['ATHN'] || Object.values(response.counts)[0] || 0;
            const fetchedSoFar = (currentPage - 1) * pageSize + response.results.length;
            hasMore = response.results.length === pageSize && fetchedSoFar < totalCount;
            
            currentPage++;
          }
          
          // Filter classes by the specific component type
          const componentClasses = allClasses.filter((cls) => {
            const clsComponent = (cls as any).component || cls.instructionType || '';
            const normalizedClsComponent = clsComponent.toLowerCase().trim();
            const normalizedTargetComponent = (component || '').toLowerCase().trim();
            
            // Match exact component or common variations for all component types
            return normalizedTargetComponent === normalizedClsComponent ||
              (normalizedTargetComponent === 'lecture' && (normalizedClsComponent === 'lec' || normalizedClsComponent === 'lecture')) ||
              (normalizedTargetComponent === 'lab' && (normalizedClsComponent === 'lab' || normalizedClsComponent === 'laboratory')) ||
              (normalizedTargetComponent === 'discussion' && normalizedClsComponent === 'discussion') ||
              (normalizedTargetComponent === 'recitation' && normalizedClsComponent === 'recitation') ||
              (normalizedTargetComponent === 'seminar' && normalizedClsComponent === 'seminar') ||
              (normalizedTargetComponent === 'tutorial' && normalizedClsComponent === 'tutorial') ||
              (normalizedTargetComponent === 'independent study' && normalizedClsComponent === 'independent study');
          });
          
          // Create course entry for this component type if there are any classes
          if (componentClasses.length > 0) {
            const title = componentClasses[0].title;
            // Use component name in catalog number to differentiate (e.g., "1330 Lab", "1330 Discussion", "1330 Recitation")
            // Only add suffix for non-lecture components to keep lecture courses clean
            const normalizedComponent = (component || '').toLowerCase().trim();
            const isLecture = normalizedComponent === 'lecture' || normalizedComponent === 'lec' || normalizedComponent === '';
            const componentSuffix = component && !isLecture ? ` ${component}` : '';
            const catalogNumberWithComponent = component && !isLecture
              ? `${catalogNumber}${componentSuffix}`
              : catalogNumber;
            
            const course: Course = {
              subject,
              catalogNumber: catalogNumberWithComponent,
              component: component || undefined,
              title: component && !isLecture
                ? `${title} (${component})`
                : title,
              classes: componentClasses,
            };
            newCourses.push(course);

            const courseKey = getCourseKey(subject, catalogNumberWithComponent);
            const selectedSet = new Set<number>();
            componentClasses.forEach((cls) => {
              selectedSet.add(cls.classNumber);
            });
            newSelections.set(courseKey, selectedSet);
            // Don't add to newExpanded - courses should start closed when transferred
          }
        } catch (err) {
          // Failed to fetch course
        }
      }

      setCourses(newCourses);
      setCourseSelections(newSelections);
      setExpandedCourses(newExpanded);
    } catch (err) {
      setError('Failed to load previous schedule courses. Please try again.');
    }
  };

  const handleGenerateSchedules = async () => {
    if (courses.length === 0) {
      setError('Please add courses first.');
      return;
    }

    const totalSelected = getTotalSelectedClassesCount();
    if (totalSelected === 0) {
      setError('Please select at least one class from the courses.');
      return;
    }

    // Create courses with only selected classes
    const coursesWithSelectedClasses: Course[] = courses
      .map((course) => {
        const courseKey = getCourseKey(course.subject, course.catalogNumber);
        const selectedSet = getSelectedClassesForCourse(courseKey);
        
        // Only include classes that are selected
        const selectedClassesForCourse = course.classes.filter((cls) =>
          selectedSet.has(cls.classNumber),
        );
        
        // Only include course if it has at least one selected class
        if (selectedClassesForCourse.length === 0) {
          return null;
        }
        
        return {
          ...course,
          classes: selectedClassesForCourse,
        };
      })
      .filter((course): course is Course => course !== null);

    if (coursesWithSelectedClasses.length === 0) {
      setError('No courses with selected classes found.');
      return;
    }

    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    setIsGenerating(true);
    setError(null);
    setSchedules([]);
    localStorage.setItem('isGeneratingSchedules', 'true');
    localStorage.removeItem('scheduleGenerationError');
    localStorage.removeItem('generatedSchedules');

    try {
      const generatedSchedules = await generateSchedules(
        coursesWithSelectedClasses,
        abortSignal,
        environment.openRouterApiKey,
        selectedPreviousSchedule,
      );

      if (abortSignal.aborted) {
        return;
      }

      setSchedules(generatedSchedules);
      localStorage.setItem('generatedSchedules', JSON.stringify(generatedSchedules));
      localStorage.removeItem('isGeneratingSchedules');
      localStorage.removeItem('scheduleGenerationError');
    } catch (err) {
      if (abortSignal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setIsGenerating(false);
        localStorage.removeItem('isGeneratingSchedules');
        return;
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to generate schedules. Please check your OpenRouter API key configuration.';
      setError(errorMessage);
      localStorage.setItem('scheduleGenerationError', JSON.stringify(errorMessage));
      localStorage.removeItem('isGeneratingSchedules');
      setIsGenerating(false);
    } finally {
      if (!abortSignal.aborted) {
        setIsGenerating(false);
      }
      abortControllerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const formatTimeDisplay = (classItem: ClassResult): string => {
    let days = '';
    let times = '';

    // Helper function to convert 24-hour to 12-hour AM/PM format
    const convertTo12Hour = (time24: string): string => {
      if (!time24 || typeof time24 !== 'string') return time24;
      if (time24.includes('AM') || time24.includes('PM') || time24.includes('am') || time24.includes('pm')) {
        return time24;
      }
      const trimmed = time24.trim();
      const [hours, minutes] = trimmed.split(':');
      if (!hours || !minutes) return time24;
      const hour24 = parseInt(hours, 10);
      if (isNaN(hour24)) return time24;
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
      return `${hour12}:${minutes} ${ampm}`;
    };

    if (classItem.meetings && classItem.meetings.length > 0) {
      // Handle multiple meetings (e.g., MWF at one time, Th at another)
      const meetingStrings: string[] = [];
      const allDays = new Set<string>();
      
      for (const meeting of classItem.meetings) {
        if (meeting.startTime && meeting.endTime) {
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
        times = meetingStrings.join('; ');
      }
      if (allDays.size > 0) {
        days = Array.from(allDays).join('');
      }
    }

    if (!days && classItem.days) {
      days = classItem.days;
    }
    if (!times && classItem.times && classItem.times !== 'TBA') {
      // Check if times already includes days (e.g., "TuTh 12:30 PM-1:50 PM")
      const dayPattern = /^((?:M|Tu|W|Th|F|S)+)\s+(.+)$/i;
      const match = classItem.times.match(dayPattern);
      
      if (match) {
        // Times already has days - extract just the time part
        const extractedDays = match[1];
        const timePart = match[2];
        // Don't set days here - they're already in the times string
        // Convert time part to AM/PM format if needed
        const timeParts = timePart.split('-');
        if (timeParts.length === 2) {
          const start12 = convertTo12Hour(timeParts[0].trim());
          const end12 = convertTo12Hour(timeParts[1].trim());
          times = `${extractedDays} ${start12}-${end12}`;
        } else {
          times = classItem.times; // Keep as-is if format is unexpected
        }
      } else {
        // Times doesn't have days - convert to AM/PM format
        const timeParts = classItem.times.split('-');
        if (timeParts.length === 2) {
          const start12 = convertTo12Hour(timeParts[0].trim());
          const end12 = convertTo12Hour(timeParts[1].trim());
          times = `${start12}-${end12}`;
        } else {
          times = classItem.times;
        }
      }
    }

    if (!times) return 'TBA';

    // Check if times already starts with day patterns (e.g., "TuTh 12:30 PM-1:50 PM")
    const dayPattern = /^((?:M|Tu|W|Th|F|S)+)\s+(.+)$/i;
    const timesHasDays = times.match(dayPattern);

    // If times already have AM/PM, check if it contains multiple meeting times
    // If it has semicolons, it already includes days for each meeting - don't add redundant prefix
    if (times.includes('AM') || times.includes('PM') || times.includes('am') || times.includes('pm')) {
      // If times contains semicolons, it's multiple meeting times with days already included
      if (times.includes(';')) {
        return times; // Don't add days prefix - each meeting time has its own days
      }
      // Single meeting time - check if it already has days
      if (timesHasDays) {
        return times; // Times already includes days, don't add them again
      }
      // Single meeting time without days - combine with days if available
      return days ? `${days} ${times}` : times;
    }

    // Fallback: format time for display (shouldn't reach here if conversion worked)
    // Check again if times already has days before adding them
    if (timesHasDays) {
      return times; // Times already includes days, don't add them again
    }
    
    const formatTime = (time: string): string => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    const [startTime, endTime] = times.split('-');
    if (startTime && endTime) {
      const formatted = `${formatTime(startTime)} - ${formatTime(endTime)}`;
      return days ? `${days} ${formatted}` : formatted;
    }

    return times;
  };

  return (
    <div className="combined-schedule-page">
      <div className="combined-page-layout">
        {/* Top Section: Courses and Breaks */}
        <div className="top-section">
          {/* Courses Section */}
          <div className="courses-section">
            <div className="section-header">
              <h2>Courses</h2>
            </div>
            <div className="course-search-container">
              <CourseSearch onCourseAdd={handleCourseAdd} />
            </div>
            {courses.length > 0 && (
              <div className="courses-list-container">
                <div className="select-all-control">
                  <label>
                    <input
                      type="checkbox"
                      checked={courses.every((c) => {
                        const cKey = getCourseKey(c.subject, c.catalogNumber);
                        const selected = getSelectedClassesForCourse(cKey);
                        return c.classes.every((cls) => selected.has(cls.classNumber));
                      })}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleSelectAll();
                        } else {
                          handleDeselectAll();
                        }
                      }}
                    />
                    Select All
                  </label>
                </div>
                <div className="courses-list">
                  {courses.map((course, index) => {
                    const courseKey = getCourseKey(course.subject, course.catalogNumber);
                    const isExpanded = expandedCourses.has(courseKey);
                    const selectedSet = getSelectedClassesForCourse(courseKey);
                    const allSelected = course.classes.every((cls) =>
                      selectedSet.has(cls.classNumber),
                    );
                    const someSelected = course.classes.some((cls) =>
                      selectedSet.has(cls.classNumber),
                    );

                    return (
                      <div key={courseKey} className="course-item">
                        <div className="course-header">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={() => handleToggleCourseSelection(courseKey, course)}
                          />
                          <button
                            className="expand-button"
                            onClick={() => toggleCourseExpansion(courseKey)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <span className="course-code">
                            {course.subject} {course.catalogNumber}
                          </span>
                          <span className="course-title">{course.title}</span>
                          <span className="course-class-count">
                            {selectedSet.size} of {course.classes.length} {course.classes.length === 1 ? 'class' : 'classes'} selected
                          </span>
                          <button
                            className="icon-button remove-button"
                            title="Remove course"
                            onClick={() => handleRemoveCourse(index)}
                          >
                            ✕
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="course-classes-dropdown">
                            <div className="classes-list">
                              {course.classes.map((cls) => {
                                const location =
                                  cls.meetings?.[0]?.roomAndBuilding ||
                                  cls.building ||
                                  cls.location ||
                                  '';
                                return (
                                  <div key={cls.classNumber} className="class-item">
                                    <input
                                      type="checkbox"
                                      checked={isClassSelected(courseKey, cls.classNumber)}
                                      onChange={() => handleToggleClass(courseKey, cls.classNumber)}
                                    />
                                    <div className="class-info">
                                      <div className="class-header-info">
                                        <span className="class-section">
                                          Section {cls.section || 'N/A'}
                                        </span>
                                        <span className="class-component">
                                          {cls.component || cls.instructionType || 'LEC'}
                                        </span>
                                        <span className="class-number">#{cls.classNumber}</span>
                                      </div>
                                      <div className="class-details">
                                        <span className="class-time">{formatTimeDisplay(cls)}</span>
                                        {location && (
                                          <span className="class-location">{location}</span>
                                        )}
                                        <span className="class-credits">
                                          {cls.minCreditHours === cls.maxCreditHours
                                            ? `${cls.minCreditHours} credits`
                                            : `${cls.minCreditHours}-${cls.maxCreditHours} credits`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Previous Schedules Section */}
          <div className="previous-schedules-section">
            <div className="section-header">
              <h2>Previous Schedules</h2>
            </div>
            <div className="previous-schedules-dropdown">
              {/* New Community Selector */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: 600 }}>
                  Select from Learning Communities:
                </h3>
                <CommunitySelector
                  collegeGroups={collegeGroups}
                  selectedCommunity={selectedCommunity}
                  onCommunitySelect={handleCommunitySelect}
                />
              </div>


              {selectedPreviousSchedule && (
                <>
                  <button
                    className="transfer-button"
                    onClick={handleTransferPreviousSchedule}
                    style={{ marginTop: '16px' }}
                  >
                    Transfer
                  </button>
                  <div className="previous-schedule-info">
                    <div className="previous-schedule-courses">
                      <h4>Courses in this schedule:</h4>
                      <ul className="previous-courses-list">
                        {selectedPreviousSchedule.classes.map((cls, idx) => (
                        <li key={idx} className="previous-course-item">
                          <span className="prev-course-code">
                            {cls.subject} {cls.catalogNumber} {cls.component && `(${cls.component})`}
                          </span>
                          <span className="prev-course-time">{cls.timeRange}</span>
                        </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Schedules Section */}
        <div className="schedules-section">
          <h2>Schedules</h2>
          <div className="schedules-controls">
            {isGenerating ? (
              <button className="cancel-button" onClick={handleCancelGeneration}>
                Cancel Generation
              </button>
            ) : (
              <button
                className="generate-button"
                onClick={handleGenerateSchedules}
                disabled={isGenerating || getTotalSelectedClassesCount() === 0}
              >
                Generate Schedules
              </button>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          {isGenerating && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Generating schedules...</p>
            </div>
          )}

          {schedules.length > 0 && (
            <div className="generated-schedules">
              <div className="generated-schedules-header">
                <h3>Generated Schedules ({schedules.length})</h3>
                <button
                  className="clear-schedules-button"
                  onClick={handleClearSchedules}
                  title="Clear all generated schedules"
                >
                  Clear All
                </button>
              </div>
              <div className="schedules-grid">
                {schedules.map((schedule) => (
                  <ScheduleCard key={schedule.scheduleNumber} schedule={schedule} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

