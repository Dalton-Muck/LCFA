import type { Schedule } from '../services/gemini.service';
import './ScheduleCard.css';

interface ScheduleCardProps {
  schedule: Schedule;
}

export function ScheduleCard({ schedule }: ScheduleCardProps) {
  return (
    <div className="schedule-card">
      <div className="schedule-header">
        <h3>Schedule {schedule.scheduleNumber}</h3>
        <span className="class-count">{schedule.classes.length} classes</span>
      </div>
      <div className="schedule-classes">
        {schedule.classes.map((classItem, index) => (
          <div key={index} className="schedule-class-item">
            <div className="class-header">
              <span className="class-code">
                {classItem.subject} {classItem.catalogNumber}
              </span>
              <span className="class-number">#{classItem.classNumber}</span>
            </div>
            <div className="class-title">
              {(() => {
                // Remove component info from title (e.g., "(Lab)", "(LEC)", "(DISc)", "(Lecture)", etc.)
                if (!classItem.title) return '';
                let cleanTitle = classItem.title;
                // Remove patterns like "(Lab)", "(LEC)", "(DISc)", "(Lecture)", "(Discussion)", "Lab", "LEC", etc.
                // Match with or without parentheses, case-insensitive
                cleanTitle = cleanTitle.replace(/\s*\(?\s*(Lab|LEC|DISc|Lecture|Discussion|Seminar|Disc|Lec)\s*\)?\s*/gi, '').trim();
                // Remove any remaining empty parentheses or extra spaces
                cleanTitle = cleanTitle.replace(/\s*\(\)\s*/g, '').trim();
                cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
                return cleanTitle;
              })()}
            </div>
            
            <div className="class-details">
              {classItem.component && (
                <div className="class-detail-row">
                  <span className="detail-label">Component:</span>
                  <span className="detail-value">{classItem.component}</span>
                </div>
              )}
              
              {classItem.section && (
                <div className="class-detail-row">
                  <span className="detail-label">Section:</span>
                  <span className="detail-value">{classItem.section}</span>
                </div>
              )}
              
              {classItem.instructionType && (
                <div className="class-detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{classItem.instructionType}</span>
                </div>
              )}
              
              {classItem.instructor && (
                <div className="class-detail-row">
                  <span className="detail-label">Instructor:</span>
                  <span className="detail-value">{classItem.instructor}</span>
                </div>
              )}
              
              {classItem.times && (
                <div className="class-detail-row">
                  <span className="detail-label">Schedule:</span>
                  <span className="detail-value">
                    {(() => {
                      // Format time for display: convert "09:40-10:35" to "9:40AM-10:35AM"
                      // Also handles multiple meeting times separated by semicolons
                      const formatTimeForDisplay = (timeStr: string): string => {
                        // Handle multiple meeting times separated by semicolons
                        if (timeStr.includes(';')) {
                          const parts = timeStr.split(';');
                          const formatSingleTime = (singleTime: string): string => {
                            const trimmed = singleTime.trim();
                            
                            // If it's TBA, return as-is
                            if (trimmed === 'TBA') {
                              return trimmed;
                            }
                            
                            // Check if it's already formatted (has AM/PM)
                            if (trimmed.includes('AM') || trimmed.includes('PM')) {
                              // Ensure proper spacing and format
                              // Handle cases like "M W F 10:45 AM-11:40 AM" -> "MWF 10:45 AM-11:40 AM"
                              const dayPattern = /^((?:M|Tu|W|Th|F|S)\s*(?:M|Tu|W|Th|F|S|\s)*)\s+(.+)$/i;
                              const match = trimmed.match(dayPattern);
                              if (match) {
                                // Remove spaces from days (e.g., "M W F" -> "MWF")
                                const days = match[1].replace(/\s+/g, '');
                                const timePart = match[2].trim();
                                return `${days} ${timePart}`;
                              }
                              return trimmed;
                            }
                            
                            // If no AM/PM, try to parse and format
                            // Extract days and time range
                            const dayPattern = /^((?:M|Tu|W|Th|F|S)\s*(?:M|Tu|W|Th|F|S|\s)*)\s+(.+)$/i;
                            const match = trimmed.match(dayPattern);
                            if (match) {
                              const days = match[1].replace(/\s+/g, ''); // Remove spaces from days
                              const timeRange = match[2].trim();
                              // Format time range if needed
                              return `${days} ${timeRange}`;
                            }
                            
                            return trimmed;
                          };
                          return parts.map(part => formatSingleTime(part)).join('; ');
                        }
                        
                        // Check if it's already formatted (has AM/PM) or is TBA
                        if (timeStr.includes('AM') || timeStr.includes('PM') || timeStr === 'TBA') {
                          return timeStr;
                        }
                        
                        // Check if times already starts with day patterns (e.g., "TuTh 12:30 PM-1:50 PM")
                        const dayPattern = /^((?:M|Tu|W|Th|F|S)+)\s+(.+)$/i;
                        const timesHasDays = timeStr.match(dayPattern);
                        
                        if (timesHasDays) {
                          // Times already includes days - don't add them again
                          return timeStr;
                        }
                        
                        // Use days field if available, otherwise parse from times string
                        let days = classItem.days || '';
                        let timeRange = timeStr;
                        
                        // If days not available, try to extract from times string
                        if (!days) {
                          const parts = timeStr.split(' ');
                          // Match day patterns: MWF, TuTh, M, Tu, Th, etc.
                          // Pattern matches: M, Tu, W, Th, F, S in any combination (case-insensitive)
                          const dayPattern = /^((?:M|Tu|W|Th|F|S)+)$/i;
                          if (parts.length > 1 && dayPattern.test(parts[0])) {
                            days = parts[0];
                            timeRange = parts.slice(1).join(' ');
                          }
                        } else {
                          // Days available, extract just the time part from times string
                          const parts = timeStr.split(' ');
                          if (parts.length > 1) {
                            // Check if first part matches days
                            const dayPattern = /^((?:M|Tu|W|Th|F|S)+)$/i;
                            if (dayPattern.test(parts[0])) {
                              timeRange = parts.slice(1).join(' ');
                            }
                          }
                        }
                        
                        const formatTime = (time: string): string => {
                          const [hours, minutes] = time.split(':');
                          const hour = parseInt(hours, 10);
                          const ampm = hour >= 12 ? 'PM' : 'AM';
                          const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                          return `${displayHour}:${minutes}${ampm}`;
                        };
                        
                        const [startTime, endTime] = timeRange.split('-');
                        if (startTime && endTime) {
                          const formatted = `${formatTime(startTime)}-${formatTime(endTime)}`;
                          return days ? `${days} ${formatted}` : formatted;
                        }
                        
                        return timeStr;
                      };
                      
                      return formatTimeForDisplay(classItem.times);
                    })()}
                  </span>
                </div>
              )}
              
              {(classItem.location || (classItem.building && classItem.room)) && (
                <div className="class-detail-row">
                  <span className="detail-label">Location:</span>
                  <span className="detail-value">
                    {classItem.location || 
                     (classItem.building && classItem.room
                       ? `${classItem.building} ${classItem.room}`
                       : classItem.building || classItem.room || '')}
                  </span>
                </div>
              )}
              
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

