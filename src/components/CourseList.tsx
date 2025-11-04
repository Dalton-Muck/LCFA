import type { Course } from '../types/course-offerings';
import './CourseList.css';

interface CourseListProps {
  courses: Course[];
  onRemoveCourse: (index: number) => void;
}

export function CourseList({ courses, onRemoveCourse }: CourseListProps) {
  if (courses.length === 0) {
    return (
      <div className="course-list empty">
        <p>No courses added yet. Search for a course above to get started.</p>
      </div>
    );
  }

  return (
    <div className="course-list">
      <h2>Your Courses ({courses.length})</h2>
      <div className="courses-grid">
        {courses.map((course, index) => (
          <div key={`${course.subject}-${course.catalogNumber}-${index}`} className="course-card">
            <button
              onClick={() => onRemoveCourse(index)}
              className="remove-button"
              aria-label={`Remove ${course.subject} ${course.catalogNumber}`}
              title="Remove course"
            >
              ×
            </button>
            <div className="course-content">
              <h3 className="course-code">
                {course.subject} {course.catalogNumber}
              </h3>
              <p className="course-title">{course.title}</p>
              <div className="course-info">
                <span className="classes-count">
                  {course.classes.length} class{course.classes.length !== 1 ? 'es' : ''} available
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

