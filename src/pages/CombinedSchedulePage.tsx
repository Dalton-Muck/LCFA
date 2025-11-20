import { useState, useEffect, useRef } from 'react';
import { CourseSearch } from '../components/CourseSearch';
import { generateSchedules, type Schedule } from '../services/gemini.service';
import { ScheduleCard } from '../components/ScheduleCard';
import type { Course, ClassResult } from '../types/course-offerings';
import { environment } from '../config/environment';
import { PREVIOUS_SCHEDULES, type PreviousSchedule } from '../data/previousSchedules';
import { getCurrentFallTerm, searchClasses } from '../services/course-offerings.service';
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
  const [showSchedules, setShowSchedules] = useState(false);
  const [selectedPreviousSchedule, setSelectedPreviousSchedule] = useState<PreviousSchedule | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
              console.error('Failed to parse saved course selections:', e);
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
        console.error('Failed to parse saved courses:', e);
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
        console.error('Failed to parse saved schedules:', e);
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
      const labCatalogNumber = `${course.catalogNumber} Lab`;
      const labCourse: Course = {
        subject: course.subject,
        catalogNumber: labCatalogNumber,
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

  const handlePreviousScheduleSelect = (schedule: PreviousSchedule | null) => {
    setSelectedPreviousSchedule(schedule);
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
      // Group by subject-catalogNumber-component to separate labs from lectures
      const uniqueCourses = new Map<string, { subject: string; catalogNumber: string }>();
      selectedPreviousSchedule.classes.forEach((cls) => {
        const baseKey = `${cls.subject}-${cls.catalogNumber}`;
        if (!uniqueCourses.has(baseKey)) {
          uniqueCourses.set(baseKey, { 
            subject: cls.subject, 
            catalogNumber: cls.catalogNumber
          });
        }
      });

      // Fetch classes for each course
      // For previous schedules, we need to fetch ALL component types (LEC, LAB, etc.)
      // and separate them into different course entries
      for (const { subject, catalogNumber } of uniqueCourses.values()) {
        try {
          // Get the class numbers from the previous schedule for this course
          const previousClassNumbers = selectedPreviousSchedule.classes
            .filter((cls) => cls.subject === subject && cls.catalogNumber === catalogNumber)
            .map((cls) => cls.classNumber);
          
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
              
              // Include LEC, LAB, and any class that matches previous schedule class numbers
              const component = (cls as any).component || cls.instructionType || '';
              const isLecture = component === 'LEC' || component === 'Lecture' || component.toLowerCase() === 'lecture';
              const isLab = component === 'LAB' || component === 'Laboratory' || component.toLowerCase() === 'laboratory' || component.toLowerCase() === 'lab';
              const isInPreviousSchedule = previousClassNumbers.includes(cls.classNumber);
              
              return isAthens && hasValidTime && (isLecture || isLab || isInPreviousSchedule);
            });
            
            allClasses.push(...matchingClasses);
            
            const totalCount = response.counts['ATHN'] || Object.values(response.counts)[0] || 0;
            const fetchedSoFar = (currentPage - 1) * pageSize + response.results.length;
            hasMore = response.results.length === pageSize && fetchedSoFar < totalCount;
            
            currentPage++;
          }
          
          // Separate classes by component type
          const lectureClasses = allClasses.filter((cls) => {
            const component = (cls as any).component || cls.instructionType || '';
            return component === 'LEC' || component === 'Lecture' || component.toLowerCase() === 'lecture';
          });
          
          const labClasses = allClasses.filter((cls) => {
            const component = (cls as any).component || cls.instructionType || '';
            return component === 'LAB' || component === 'Laboratory' || component.toLowerCase() === 'laboratory' || component.toLowerCase() === 'lab';
          });
          
          // Create separate course for lectures if there are any
          if (lectureClasses.length > 0) {
            const title = lectureClasses[0].title;
            const course: Course = {
              subject,
              catalogNumber,
              title,
              classes: lectureClasses,
            };
            newCourses.push(course);

            const courseKey = getCourseKey(subject, catalogNumber);
            const selectedSet = new Set<number>();
            lectureClasses.forEach((cls) => {
              selectedSet.add(cls.classNumber);
            });
            newSelections.set(courseKey, selectedSet);
            newExpanded.add(courseKey);
          }
          
          // Create separate course for labs if there are any
          if (labClasses.length > 0) {
            const title = labClasses[0].title;
            // Use a modified catalog number to differentiate the lab course
            const labCatalogNumber = `${catalogNumber} Lab`;
            const course: Course = {
              subject,
              catalogNumber: labCatalogNumber,
              title: `${title} (Lab)`,
              classes: labClasses,
            };
            newCourses.push(course);

            // Use a unique course key for the lab
            const courseKey = getCourseKey(subject, labCatalogNumber);
            const selectedSet = new Set<number>();
            labClasses.forEach((cls) => {
              selectedSet.add(cls.classNumber);
            });
            newSelections.set(courseKey, selectedSet);
            newExpanded.add(courseKey);
          }
        } catch (err) {
          console.error(`Failed to fetch ${subject} ${catalogNumber}:`, err);
        }
      }

      setCourses(newCourses);
      setCourseSelections(newSelections);
      setExpandedCourses(newExpanded);
    } catch (err) {
      setError('Failed to load previous schedule courses. Please try again.');
      console.error('Error loading previous schedule:', err);
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
    setShowSchedules(false);
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
      setShowSchedules(true);
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

    if (classItem.meetings && classItem.meetings.length > 0) {
      const meeting = classItem.meetings[0];
      if (meeting.days && Array.isArray(meeting.days)) {
        days = meeting.days.join('');
      }
      if (meeting.startTime && meeting.endTime) {
        times = `${meeting.startTime}-${meeting.endTime}`;
      }
    }

    if (!days && classItem.days) {
      days = classItem.days;
    }
    if (!times && classItem.times && classItem.times !== 'TBA') {
      times = classItem.times;
    }

    if (!times) return 'TBA';

    // Format time for display
    const formatTime = (time: string): string => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes}${ampm}`;
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
              <label htmlFor="previous-schedule-select">Select a previous schedule:</label>
              <select
                id="previous-schedule-select"
                value={selectedPreviousSchedule?.scheduleNumber || ''}
                onChange={(e) => {
                  const scheduleNum = parseInt(e.target.value);
                  const schedule = PREVIOUS_SCHEDULES.find((s) => s.scheduleNumber === scheduleNum) || null;
                  handlePreviousScheduleSelect(schedule);
                }}
                className="schedule-select"
              >
                <option value="">Select a previous schedule...</option>
                {PREVIOUS_SCHEDULES.map((schedule) => (
                  <option key={schedule.scheduleNumber} value={schedule.scheduleNumber}>
                    {schedule.name} ({schedule.classes.length} courses)
                  </option>
                ))}
              </select>
              {selectedPreviousSchedule && (
                <>
                  <button
                    className="transfer-button"
                    onClick={handleTransferPreviousSchedule}
                  >
                    Transfer
                  </button>
                  <div className="previous-schedule-info">
                    <p className="info-text">
                      Selected: {selectedPreviousSchedule.name} with {selectedPreviousSchedule.classes.length} courses.
                      Click "Transfer" to load these courses. The AI will try to match similar times when generating schedules.
                    </p>
                    <div className="previous-schedule-courses">
                      <h4>Courses in this schedule:</h4>
                      <ul className="previous-courses-list">
                        {selectedPreviousSchedule.classes.map((cls, idx) => (
                        <li key={idx} className="previous-course-item">
                          <span className="prev-course-code">
                            {cls.subject} {cls.catalogNumber} (#{cls.classNumber})
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
            <button
              className="view-button"
              onClick={() => setShowSchedules(!showSchedules)}
              disabled={schedules.length === 0}
            >
              View Schedules {schedules.length > 0 && `(${schedules.length})`}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {isGenerating && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Generating schedules...</p>
            </div>
          )}

          {showSchedules && schedules.length > 0 && (
            <div className="generated-schedules">
              <h3>Generated Schedules ({schedules.length})</h3>
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

