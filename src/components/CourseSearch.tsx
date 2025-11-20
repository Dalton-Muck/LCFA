import { useState } from 'react';
import { getCurrentFallTerm, searchClasses } from '../services/course-offerings.service';
import type { Course, ClassResult } from '../types/course-offerings';

interface CourseSearchProps {
  onCourseAdd: (course: Course) => void;
  maxCourses?: number;
}

export function CourseSearch({ onCourseAdd }: CourseSearchProps) {
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCourseInput = (input: string): { subject: string; catalogNumber: string } | null => {
    // Match patterns like "MATH 1500", "CS 2400", "MATH1500", "CS2400", etc.
    const match = input.trim().toUpperCase().match(/^([A-Z]+)\s*(\d+)$/);
    if (!match) {
      return null;
    }
    return {
      subject: match[1],
      catalogNumber: match[2],
    };
  };

  const handleSearch = async () => {
    const parsed = parseCourseInput(searchInput);
    if (!parsed) {
      setError('Invalid format. Please use format like "MATH 1500" or "CS 2400"');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      // Get current Fall term
      const { termCode } = await getCurrentFallTerm();

      // Search for all classes matching this subject and catalog number
      // Fetch ALL component types (LEC, LAB, etc.) to allow separating them
      const pageSize = 50;
      const allClasses: ClassResult[] = [];
      let currentPage = 1;
      let hasMore = true;
      
      while (hasMore) {
        const response = await searchClasses(
          {
            terms: [termCode],
            campuses: ['ATHN'],
            subjects: [parsed.subject],
            catalogNumber: parsed.catalogNumber,
          },
          currentPage,
          pageSize,
        );
        
        let matchingClasses = response.results.filter((cls: ClassResult) => {
          // Must match subject and catalog number
          if (cls.subject !== parsed.subject || cls.catalogNumber !== parsed.catalogNumber) {
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
          
          // Include LEC and LAB components
          const component = (cls as any).component || cls.instructionType || '';
          const isLecture = component === 'LEC' || component === 'Lecture' || component.toLowerCase() === 'lecture';
          const isLab = component === 'LAB' || component === 'Laboratory' || component.toLowerCase() === 'laboratory' || component.toLowerCase() === 'lab';
          
          return isAthens && hasValidTime && (isLecture || isLab);
        });
        
        allClasses.push(...matchingClasses);
        
        const totalCount = response.counts['ATHN'] || Object.values(response.counts)[0] || 0;
        const fetchedSoFar = (currentPage - 1) * pageSize + response.results.length;
        hasMore = response.results.length === pageSize && fetchedSoFar < totalCount;
        
        currentPage++;
      }
      
      const classes = allClasses;

      if (classes.length === 0) {
        setError(
          `No classes with valid schedule times found for ${parsed.subject} ${parsed.catalogNumber} on Athens campus. ` +
          `Classes without time information are excluded.`
        );
        setIsSearching(false);
        return;
      }

      // Get the title from the first class (they should all have the same title)
      const title = classes[0].title;

      // Create course object with all classes
      const course: Course = {
        subject: parsed.subject,
        catalogNumber: parsed.catalogNumber,
        title: title,
        classes: classes,
      };

      onCourseAdd(course);
      setSearchInput('');
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to search for course. Please try again.',
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="course-search">
      <div className="search-input-group">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter course (e.g., MATH 1500 or CS 2400)"
          disabled={isSearching}
          className="search-input"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchInput.trim()}
          className="search-button"
        >
          {isSearching ? 'Searching...' : 'Add Course'}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

