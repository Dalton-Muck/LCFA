import { useState } from 'react';
import { searchClassesAllPages, getCurrentFallTerm } from '../services/course-offerings.service';
import type { Course } from '../types/course-offerings';

interface CourseSearchProps {
  onCourseAdd: (course: Course) => void;
  maxCourses?: number;
}

export function CourseSearch({ onCourseAdd, maxCourses = 4 }: CourseSearchProps) {
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
      // Only lectures (LEC) on Athens campus are returned by the service
      const classes = await searchClassesAllPages(
        {
          terms: [termCode],
          campuses: ['ATHN'], // Athens campus only
          subjects: [parsed.subject],
          catalogNumber: parsed.catalogNumber,
        },
        (classResult) =>
          classResult.subject === parsed.subject &&
          classResult.catalogNumber === parsed.catalogNumber,
      );

      if (classes.length === 0) {
        setError(
          `No lecture classes with valid schedule times found for ${parsed.subject} ${parsed.catalogNumber} on Athens campus. ` +
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
      {maxCourses && (
        <div className="search-hint">
          You can add up to {maxCourses} courses
        </div>
      )}
    </div>
  );
}

