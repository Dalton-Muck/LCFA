import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { generateSchedules, type Schedule } from '../services/ollama.service';
import { ScheduleCard } from '../components/ScheduleCard';
import type { Course } from '../types/course-offerings';
import './ScheduleGenerationPage.css';

export function ScheduleGenerationPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load courses and schedules from localStorage on mount
  useEffect(() => {
    // Load courses
    const savedCourses = localStorage.getItem('selectedCourses');
    if (savedCourses) {
      try {
        const parsed = JSON.parse(savedCourses);
        if (Array.isArray(parsed)) {
          setCourses(parsed);
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
    
    // If we have schedules but also have a generating flag, clear the flag
    // (generation likely completed while user was on another page)
    if (savedGenerating === 'true' && savedSchedulesJson) {
      localStorage.removeItem('isGeneratingSchedules');
      setIsGenerating(false);
    } else if (savedGenerating === 'true') {
      // Still generating, show loading state
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

  // Save schedules to localStorage whenever they change
  useEffect(() => {
    if (schedules.length > 0) {
      localStorage.setItem('generatedSchedules', JSON.stringify(schedules));
      // Clear generating flag when schedules are saved
      localStorage.removeItem('isGeneratingSchedules');
    }
  }, [schedules]);

  // Save generation state to localStorage
  useEffect(() => {
    if (isGenerating) {
      localStorage.setItem('isGeneratingSchedules', 'true');
    } else {
      localStorage.removeItem('isGeneratingSchedules');
    }
  }, [isGenerating]);

  // Save error to localStorage
  useEffect(() => {
    if (error) {
      localStorage.setItem('scheduleGenerationError', JSON.stringify(error));
    } else {
      localStorage.removeItem('scheduleGenerationError');
    }
  }, [error]);

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

  const handleGenerateSchedules = async () => {
    if (courses.length === 0) {
      setError('Please add courses first on the Course Search page.');
      localStorage.setItem('scheduleGenerationError', JSON.stringify('Please add courses first on the Course Search page.'));
      return;
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    setIsGenerating(true);
    setError(null);
    setSchedules([]);
    localStorage.setItem('isGeneratingSchedules', 'true');
    localStorage.removeItem('scheduleGenerationError');
    localStorage.removeItem('generatedSchedules');

    try {
      const generatedSchedules = await generateSchedules(courses, abortSignal);
      
      // Check if request was aborted
      if (abortSignal.aborted) {
        return;
      }
      
      setSchedules(generatedSchedules);
      localStorage.setItem('generatedSchedules', JSON.stringify(generatedSchedules));
      localStorage.removeItem('isGeneratingSchedules');
      localStorage.removeItem('scheduleGenerationError');
    } catch (err) {
      // Don't show error if it was cancelled
      if (abortSignal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setIsGenerating(false);
        localStorage.removeItem('isGeneratingSchedules');
        return;
      }
      
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to generate schedules. Make sure Ollama is running on localhost:11434';
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

  return (
    <div className="schedule-generation-page">
      <header className="page-header">
        <h1>Generate Schedules</h1>
        <p>AI-powered schedule generation from your selected courses</p>
      </header>

      <div className="page-content">
        {courses.length === 0 ? (
          <div className="empty-state">
            <p>No courses selected.</p>
            <p>
              <Link to="/">Go to Course Search</Link> to add courses first.
            </p>
          </div>
        ) : (
          <>
            <div className="controls-section">
              {isGenerating ? (
                <button
                  onClick={handleCancelGeneration}
                  className="cancel-button"
                >
                  Cancel Generation
                </button>
              ) : (
                <button
                  onClick={handleGenerateSchedules}
                  disabled={isGenerating}
                  className="generate-button"
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
              <div className="schedules-section">
                <h2>Generated Schedules ({schedules.length})</h2>
                <div className="schedules-grid">
                  {schedules.map((schedule) => (
                    <ScheduleCard key={schedule.scheduleNumber} schedule={schedule} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

