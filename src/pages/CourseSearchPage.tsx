import { useState, useEffect } from 'react';
import { CourseSearch } from '../components/CourseSearch';
import { CourseList } from '../components/CourseList';
import type { Course } from '../types/course-offerings';
import './CourseSearchPage.css';

const MAX_COURSES = 4;

export function CourseSearchPage() {
  const [courses, setCourses] = useState<Course[]>([]);

  const handleCourseAdd = (course: Course) => {
    // Check if course already exists
    const exists = courses.some(
      (c) => c.subject === course.subject && c.catalogNumber === course.catalogNumber,
    );

    if (exists) {
      alert(`${course.subject} ${course.catalogNumber} is already in your list.`);
      return;
    }

    // Check if we've reached the max
    if (courses.length >= MAX_COURSES) {
      alert(`You can only add up to ${MAX_COURSES} courses.`);
      return;
    }

    setCourses([...courses, course]);
    
    // Store courses in localStorage for persistence across pages
    localStorage.setItem('selectedCourses', JSON.stringify([...courses, course]));
  };

  const handleRemoveCourse = (index: number) => {
    const newCourses = courses.filter((_, i) => i !== index);
    setCourses(newCourses);
    localStorage.setItem('selectedCourses', JSON.stringify(newCourses));
  };

  // Load courses from localStorage on mount
  useEffect(() => {
    const savedCourses = localStorage.getItem('selectedCourses');
    if (savedCourses) {
      try {
        const parsed = JSON.parse(savedCourses);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCourses(parsed);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  return (
    <div className="course-search-page">
      <header className="page-header">
        <h1>Course Search</h1>
        <p>Search and add courses to generate your schedule</p>
      </header>
      <div className="page-content">
        <div className="search-section">
          <CourseSearch onCourseAdd={handleCourseAdd} maxCourses={MAX_COURSES} />
        </div>
        <div className="courses-section">
          <CourseList courses={courses} onRemoveCourse={handleRemoveCourse} />
        </div>
      </div>
    </div>
  );
}

