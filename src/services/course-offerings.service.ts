import { environment, normalizeBaseUrl } from '../config/environment';
import type { ClassResult, ClassesResponse, Term } from '../types/course-offerings';

const courseCatalogBase = normalizeBaseUrl(environment.courseCatalogBase);
const searchEndpoint = `${courseCatalogBase}/search/query`;
const termsEndpoint = `${courseCatalogBase}/data/terms`;

/**
 * Get the current Fall term from the course offerings API.
 * Terms are returned in descending order by STRM (most recent first).
 */
export async function getCurrentFallTerm(): Promise<{ termCode: string; term: Term }> {
  try {
    const response = await fetch(termsEndpoint);
    if (!response.ok) {
      throw new Error(`Failed to fetch terms: ${response.statusText}`);
    }
    const availableTerms: Term[] = await response.json();

    const fallTerm = availableTerms.find(
      (termItem) =>
        termItem.strm.endsWith('1') ||
        termItem.description.toLowerCase().includes('fall'),
    );

    if (!fallTerm) {
      throw new Error('No Fall term found in available terms');
    }

    return {
      termCode: `${fallTerm.strm}::${fallTerm.code}`,
      term: fallTerm,
    };
  } catch (error) {
    throw new Error(
      `Failed to get current Fall term from ${termsEndpoint}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get all available terms from the course offerings API.
 */
export async function getAllTerms(): Promise<Term[]> {
  try {
    const response = await fetch(termsEndpoint);
    if (!response.ok) {
      throw new Error(`Failed to fetch terms: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(
      `Failed to get terms from ${termsEndpoint}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Search for classes using the course offerings search endpoint.
 * Supports pagination and will fetch all pages if needed.
 */
export async function searchClasses(
  searchParams: {
    terms: string[];
    campuses: string[];
    subjects?: string[];
    catalogNumber?: string;
    level?: string;
    status?: string[];
    [key: string]: any;
  },
  page: number = 1,
  pageSize: number = 50,
): Promise<ClassesResponse> {
  const params = new URLSearchParams({
    selectedTab: searchParams.campuses[0] || 'ATHN',
    page: page.toString(),
    pageSize: pageSize.toString(),
  });

  const requestBody = {
    terms: searchParams.terms,
    campuses: searchParams.campuses,
    program: '',
    subjects: searchParams.subjects || [],
    catalogNumber: searchParams.catalogNumber || '',
    name: '',
    topic: '',
    level: searchParams.level || 'UGRD',
    status: searchParams.status || ['OPEN', 'WAITLIST', 'MAJORS', 'PERMISSION', 'FULL'],
    generalEducationTier1: [],
    generalEducationTier2: [],
    generalEducationTier3: [],
    themes: [],
    bricks: [],
    isSync: true,
    isAsync: true,
    instructors: [],
    description: '',
    offeredInPerson: true,
    offeredOnline: true,
    startTime: '',
    endTime: '',
    days: [],
    eligibleGrades: '',
    building: [],
  };

  try {
    const response = await fetch(`${searchEndpoint}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to search classes: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Log the first class to see what fields are available
    if (data.results && data.results.length > 0) {
      console.log('Sample class from API response:', JSON.stringify(data.results[0], null, 2));
    }
    
    return data;
  } catch (error) {
    throw new Error(
      `Failed to search classes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Search for classes and fetch all pages of results.
 * Continues fetching until all matching classes are retrieved.
 */
export async function searchClassesAllPages(
  searchParams: {
    terms: string[];
    campuses: string[];
    subjects?: string[];
    catalogNumber?: string;
    level?: string;
    status?: string[];
    [key: string]: any;
  },
  filterFn?: (classResult: ClassResult) => boolean,
): Promise<ClassResult[]> {
  const pageSize = 50;
  const allClasses: ClassResult[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await searchClasses(searchParams, currentPage, pageSize);
      let matchingClasses = response.results;
      
      // Filter to only include lectures (LEC) on Athens campus WITH VALID TIME DATA
      matchingClasses = matchingClasses.filter((cls) => {
        // Check component field - should be "LEC" or "Lecture"
        const component = (cls as any).component || cls.instructionType || '';
        const isLecture = component === 'LEC' || 
                         component === 'Lecture' || 
                         component.toLowerCase() === 'lecture';
        
        // Check campus - should be Athens (already filtered by campuses param, but double-check)
        const location = (cls as any).location || '';
        const isAthens = location.includes('Athens') || 
                        searchParams.campuses.includes('ATHN');
        
        // CRITICAL: Must have valid time data - check meetings array for startTime and endTime
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
        // Fallback: check if times field exists and is valid
        if (!hasValidTime && (cls as any).times && typeof (cls as any).times === 'string' && (cls as any).times.trim() !== '' && (cls as any).times !== 'TBA') {
          hasValidTime = true;
        }
        
        // Only include if it's a lecture, on Athens campus, AND has valid time data
        return isLecture && isAthens && hasValidTime;
      });
      
      if (filterFn) {
        matchingClasses = matchingClasses.filter(filterFn);
      }

      allClasses.push(...matchingClasses);

      const totalCount = response.counts['ATHN'] || Object.values(response.counts)[0] || 0;
      const fetchedSoFar = (currentPage - 1) * pageSize + response.results.length;
      hasMore = response.results.length === pageSize && fetchedSoFar < totalCount;

      currentPage++;
    } catch (error) {
      throw new Error(
        `Failed to fetch page ${currentPage}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return allClasses;
}

