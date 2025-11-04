# Course Offerings Endpoint Integration Guide

This guide details the changes needed to integrate the Course Offerings API endpoints (`/data/terms` and `/search/query`) into the application. This is the **first branch** that focuses solely on endpoint integration and testing, with **no UI components**.

## Overview

This integration adds a service that interacts with the Course Offerings API to:
1. Fetch available terms from `/data/terms`
2. Search for classes using `/search/query` with pagination support
3. Handle all errors appropriately
4. Include comprehensive test coverage

## Files to Create/Modify

### 1. Environment Configuration

**File:** `src/environment.js.jinja2`

Add the course catalog base endpoint to the resources object:

```javascript
root.ohio.resources = {
    // ... existing resources ...
    'course-catalog': 'https://ais.kube.ohio.edu/api/course-offerings',
};
```

**Important Notes:**
- Use the **base endpoint** (`/course-offerings`), not the full path (`/search/query`)
- The service will construct specific endpoints internally (`/search/query` and `/data/terms`)
- If your environment uses dynamic k8sApi, you can use: `root.ohio.k8sApi + '/course-offerings'`
- The service includes a `normalizeBaseUrl()` method to handle cases where the environment might accidentally include `/search/query` in the base URL

### 2. Service File

**File:** `src/app/services/course-offerings/course-offerings.service.ts`

Create a new service file with the following structure:

```typescript
import { Injectable } from '@angular/core';
import { Observable, throwError, EMPTY } from 'rxjs';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '@oit/cad-angular-components-lib';
import { environment } from '../../../environments/environment';
import { map, catchError, switchMap, expand, reduce } from 'rxjs/operators';

export interface ClassResult {
  subject: string;
  catalogNumber: string;
  title: string;
  description?: string;
  requisite?: string;
  topic?: string;
  classNumber: number;
  minCreditHours: number;
  maxCreditHours: number;
  college: string;
  eligibleGrades?: string;
  department: string;
  retake?: string;
  note?: string;
}

export interface ClassesResponse {
  results: ClassResult[];
  metadata?: {
    page: number;
    campus: string;
    lastViewRefreshDate?: string;
  };
  counts: Record<string, number>; // Campus code -> count (e.g., { "ATHN": 1500 })
}

export interface Term {
  strm: string;
  year: number;
  description: string;
  code: string; // TERM_CODE
}

@Injectable({
  providedIn: 'root',
})
export class CourseOfferingsService {
  private readonly courseCatalogBase: string;
  private readonly searchEndpoint: string;
  private readonly termsEndpoint: string;

  private normalizeBaseUrl(url: string): string {
    if (!url) {
      return url;
    }
    return url.replace(/\/search\/query\/?$/, '').replace(/\/$/, '');
  }

  /**
   * Get the current Fall term from the course offerings API.
   * Terms are returned in descending order by STRM (most recent first).
   * 
   * @returns Observable that emits an object with the term code and term information
   */
  getCurrentFallTerm(): Observable<{ termCode: string; term: Term }> {
    return this.http.get<Term[]>(this.termsEndpoint).pipe(
      map((availableTerms) => {
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
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError(
          () =>
            new Error(
              `Failed to get current Fall term from ${this.termsEndpoint}. Error: ${error.message}`,
            ),
        );
      }),
    );
  }

  /**
   * Get all available terms from the course offerings API.
   * 
   * @returns Observable that emits an array of all available terms
   */
  getAllTerms(): Observable<Term[]> {
    return this.http.get<Term[]>(this.termsEndpoint).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(
          () =>
            new Error(
              `Failed to get terms from ${this.termsEndpoint}. Error: ${error.message}`,
            ),
        );
      }),
    );
  }

  /**
   * Search for classes using the course offerings search endpoint.
   * Supports pagination and will fetch all pages if needed.
   * 
   * @param searchParams - Search parameters including terms, campuses, subjects, catalogNumber, etc.
   * @param page - Page number to fetch (default: 1)
   * @param pageSize - Number of results per page (default: 50)
   * @returns Observable that emits a ClassesResponse with results and counts
   */
  searchClasses(
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
  ): Observable<ClassesResponse> {
    const params = new HttpParams()
      .set('selectedTab', searchParams.campuses[0] || 'ATHN')
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

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
      ...searchParams,
    };

    return this.http.post<ClassesResponse>(this.searchEndpoint, requestBody, { params }).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(
          () =>
            new Error(
              `Failed to search classes: ${error.message}`,
            ),
        );
      }),
    );
  }

  /**
   * Search for classes and fetch all pages of results.
   * Continues fetching until all matching classes are retrieved.
   * 
   * @param searchParams - Search parameters
   * @param filterFn - Optional function to filter results after fetching (e.g., by exact subject/catalog match)
   * @returns Observable that emits an array of all matching ClassResult objects
   */
  searchClassesAllPages(
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
  ): Observable<ClassResult[]> {
    const pageSize = 50;

    const fetchPage = (
      currentPage: number,
    ): Observable<{
      page: number;
      classes: ClassResult[];
      totalCount: number;
      hasMore: boolean;
    }> => {
      return this.searchClasses(searchParams, currentPage, pageSize).pipe(
        map((response) => {
          let matchingClasses = response.results;
          if (filterFn) {
            matchingClasses = response.results.filter(filterFn);
          }

          const totalCount = response.counts['ATHN'] || Object.values(response.counts)[0] || 0;
          const fetchedSoFar = (currentPage - 1) * pageSize + response.results.length;
          const hasMore =
            response.results.length === pageSize && fetchedSoFar < totalCount;

          return {
            page: currentPage,
            classes: matchingClasses,
            totalCount: totalCount,
            hasMore: hasMore,
          };
        }),
        catchError((error: HttpErrorResponse) => {
          return throwError(
            () =>
              new Error(
                `Failed to fetch page ${currentPage}: ${error.message}`,
              ),
          );
        }),
      );
    };

    return fetchPage(1).pipe(
      expand((pageResult) => {
        if (!pageResult.hasMore) {
          return EMPTY;
        }

        return fetchPage(pageResult.page + 1);
      }),
      reduce(
        (
          accumulatedClasses: ClassResult[],
          pageResult: {
            page: number;
            classes: ClassResult[];
            totalCount: number;
            hasMore: boolean;
          },
        ) => {
          return [...accumulatedClasses, ...pageResult.classes];
        },
        [],
      ),
    );
  }

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {
    const rawBaseUrl = environment.ohio.resources['course-catalog'];
    if (!rawBaseUrl) {
      throw new Error(
        'Course catalog endpoint not configured. Please set root.ohio.resources["course-catalog"] in src/environment.js.jinja2',
      );
    }

    this.courseCatalogBase = this.normalizeBaseUrl(rawBaseUrl);
    this.searchEndpoint = `${this.courseCatalogBase}/search/query`;
    this.termsEndpoint = `${this.courseCatalogBase}/data/terms`;
  }
}
```

**Key Points:**
- Service name: `CourseOfferingsService` (more generic, suitable for endpoint integration)
- Public methods:
  - `getCurrentFallTerm()` - Gets the current Fall term (useful for searches)
  - `getAllTerms()` - Gets all available terms
  - `searchClasses()` - Single-page search
  - `searchClassesAllPages()` - Multi-page search with filtering
- All methods use proper error handling with `catchError`
- All HTTP calls include error handling
- The service normalizes the base URL to handle configuration mistakes

### 3. Test File

**File:** `src/app/services/course-offerings/course-offerings.service.spec.ts`

Create comprehensive tests following the existing test patterns in the codebase:

```typescript
import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NotificationService } from '@oit/cad-angular-components-lib';
import { AngularComponentsModule } from '@oit/cad-angular-components-lib';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import {
  CourseOfferingsService,
  ClassResult,
  ClassesResponse,
  Term,
} from './course-offerings.service';
import { environment } from '../../../environments/environment';

describe('CourseOfferingsService', () => {
  let service: CourseOfferingsService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const baseUrl = 'https://test-api.example.com';
  const courseCatalogBase = `${baseUrl}/api/course-offerings`;
  const searchEndpoint = `${courseCatalogBase}/search/query`;
  const termsEndpoint = `${courseCatalogBase}/data/terms`;

  const mockTerms: Term[] = [
    {
      strm: '2241',
      year: 2024,
      description: 'Fall 2024',
      code: 'FA24',
    },
    {
      strm: '2238',
      year: 2023,
      description: 'Spring 2024',
      code: 'SP24',
    },
    {
      strm: '2231',
      year: 2023,
      description: 'Fall 2023',
      code: 'FA23',
    },
  ];

  const mockClassResult: ClassResult = {
    subject: 'CS',
    catalogNumber: '2400',
    title: 'Data Structures and Algorithms',
    classNumber: 12345,
    minCreditHours: 3,
    maxCreditHours: 3,
    college: 'Engineering',
    department: 'Computer Science',
  };

  beforeEach(() => {
    environment.ohio = {
      resources: { 'course-catalog': courseCatalogBase },
    };

    TestBed.configureTestingModule({
      providers: [
        CourseOfferingsService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
      imports: [AngularComponentsModule.forRoot(environment)],
    });

    service = TestBed.inject(CourseOfferingsService);
    httpMock = TestBed.inject(HttpTestingController);
    notificationService = TestBed.inject(NotificationService);
    spyOn(notificationService, 'catchAndDisplay').and.callFake(() => (source: any) => source);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getAllTerms', () => {
    it('should fetch all terms from the API', (done) => {
      service.getAllTerms().subscribe((terms) => {
        expect(terms).toEqual(mockTerms);
        done();
      });

      const req = httpMock.expectOne(termsEndpoint);
      expect(req.request.method).toBe('GET');
      req.flush(mockTerms);
    });

    it('should handle error when fetching terms fails', (done) => {
      service.getAllTerms().subscribe({
        next: () => {
          fail('Should not succeed');
        },
        error: (error) => {
          expect(error.message).toContain('Failed to get terms');
          done();
        },
      });

      const req = httpMock.expectOne(termsEndpoint);
      req.error(new ProgressEvent('Network error'));
    });
  });

  describe('getCurrentFallTerm', () => {
    it('should fetch and return the current Fall term', (done) => {
      service.getCurrentFallTerm().subscribe((result) => {
        expect(result.termCode).toBe('2241::FA24');
        expect(result.term.year).toBe(2024);
        expect(result.term.description).toBe('Fall 2024');
        done();
      });

      const req = httpMock.expectOne(termsEndpoint);
      expect(req.request.method).toBe('GET');
      req.flush(mockTerms);
    });

    it('should find Fall term by strm ending in "1"', (done) => {
      const termsWithFallByStrm: Term[] = [
        {
          strm: '2241',
          year: 2024,
          description: 'Some Term',
          code: 'T24',
        },
      ];

      service.getCurrentFallTerm().subscribe((result) => {
        expect(result.termCode).toBe('2241::T24');
        done();
      });

      const req = httpMock.expectOne(termsEndpoint);
      req.flush(termsWithFallByStrm);
    });

    it('should find Fall term by description containing "fall" (case insensitive)', (done) => {
      const termsWithFallByDescription: Term[] = [
        {
          strm: '2245',
          year: 2024,
          description: 'Fall Semester 2024',
          code: 'FA24',
        },
      ];

      service.getCurrentFallTerm().subscribe((result) => {
        expect(result.termCode).toBe('2245::FA24');
        done();
      });

      const req = httpMock.expectOne(termsEndpoint);
      req.flush(termsWithFallByDescription);
    });

    it('should handle error when no Fall term is found', (done) => {
      const springOnlyTerms: Term[] = [
        {
          strm: '2238',
          year: 2023,
          description: 'Spring 2024',
          code: 'SP24',
        },
      ];

      service.getCurrentFallTerm().subscribe({
        next: () => {
          fail('Should not succeed');
        },
        error: (error) => {
          expect(error.message).toContain('No Fall term found');
          done();
        },
      });

      const req = httpMock.expectOne(termsEndpoint);
      req.flush(springOnlyTerms);
    });
  });

  describe('searchClasses', () => {
    it('should search for classes with proper request body and params', (done) => {
      const mockClassesResponse: ClassesResponse = {
        results: [mockClassResult],
        counts: { ATHN: 1 },
      };

      const searchParams = {
        terms: ['2241::FA24'],
        campuses: ['ATHN'],
        subjects: ['CS'],
        catalogNumber: '2400',
        level: 'UGRD',
        status: ['OPEN', 'WAITLIST', 'MAJORS', 'PERMISSION', 'FULL'],
      };

      service.searchClasses(searchParams).subscribe((response) => {
        expect(response.results).toEqual([mockClassResult]);
        expect(response.counts).toEqual({ ATHN: 1 });
        done();
      });

      const req = httpMock.expectOne(
        (request) =>
          request.url === searchEndpoint &&
          request.method === 'POST' &&
          request.params.get('selectedTab') === 'ATHN' &&
          request.params.get('page') === '1' &&
          request.params.get('pageSize') === '50',
      );

      expect(req.request.body.terms).toEqual(['2241::FA24']);
      expect(req.request.body.campuses).toEqual(['ATHN']);
      expect(req.request.body.subjects).toEqual(['CS']);
      expect(req.request.body.catalogNumber).toBe('2400');
      req.flush(mockClassesResponse);
    });

    it('should handle pagination parameters', (done) => {
      const mockClassesResponse: ClassesResponse = {
        results: [mockClassResult],
        counts: { ATHN: 1 },
      };

      service.searchClasses({ terms: ['2241::FA24'], campuses: ['ATHN'] }, 2, 25).subscribe(() => {
        done();
      });

      const req = httpMock.expectOne(
        (request) =>
          request.url === searchEndpoint &&
          request.params.get('page') === '2' &&
          request.params.get('pageSize') === '25',
      );
      req.flush(mockClassesResponse);
    });

    it('should handle error when search fails', (done) => {
      service
        .searchClasses({ terms: ['2241::FA24'], campuses: ['ATHN'] })
        .subscribe({
          next: () => {
            fail('Should not succeed');
          },
          error: (error) => {
            expect(error.message).toContain('Failed to search classes');
            done();
          },
        });

      const req = httpMock.expectOne((request) => request.url === searchEndpoint);
      req.error(new ProgressEvent('Network error'));
    });
  });

  describe('searchClassesAllPages', () => {
    it('should fetch all pages when results span multiple pages', (done) => {
      const page1Results: ClassResult[] = Array.from({ length: 50 }, (_, index) => ({
        ...mockClassResult,
        classNumber: index + 1,
      }));

      const page2Results: ClassResult[] = [
        { ...mockClassResult, classNumber: 51 },
      ];

      service
        .searchClassesAllPages({
          terms: ['2241::FA24'],
          campuses: ['ATHN'],
          subjects: ['CS'],
        })
        .subscribe((allClasses) => {
          expect(allClasses.length).toBe(51);
          done();
        });

      const page1Request = httpMock.expectOne(
        (request) =>
          request.url === searchEndpoint && request.params.get('page') === '1',
      );
      page1Request.flush({
        results: page1Results,
        counts: { ATHN: 51 },
      } as ClassesResponse);

      const page2Request = httpMock.expectOne(
        (request) =>
          request.url === searchEndpoint && request.params.get('page') === '2',
      );
      page2Request.flush({
        results: page2Results,
        counts: { ATHN: 51 },
      } as ClassesResponse);
    });

    it('should apply filter function when provided', (done) => {
      const mixedResults: ClassResult[] = [
        { ...mockClassResult, subject: 'CS', catalogNumber: '2400' },
        { ...mockClassResult, subject: 'CS', catalogNumber: '2300', classNumber: 99999 },
        { ...mockClassResult, subject: 'MATH', catalogNumber: '2400', classNumber: 88888 },
        { ...mockClassResult, subject: 'CS', catalogNumber: '2400', classNumber: 77777 },
      ];

      service
        .searchClassesAllPages(
          { terms: ['2241::FA24'], campuses: ['ATHN'] },
          (classItem) =>
            classItem.subject === 'CS' && classItem.catalogNumber === '2400',
        )
        .subscribe((allClasses) => {
          expect(allClasses.length).toBe(2);
          expect(
            allClasses.every(
              (classItem) =>
                classItem.subject === 'CS' && classItem.catalogNumber === '2400',
            ),
          ).toBeTrue();
          done();
        });

      const req = httpMock.expectOne((request) => request.url === searchEndpoint);
      req.flush({
        results: mixedResults,
        counts: { ATHN: 4 },
      } as ClassesResponse);
    });

    it('should handle pagination errors gracefully', (done) => {
      const page1Results: ClassResult[] = Array.from({ length: 50 }, (_, index) => ({
        ...mockClassResult,
        classNumber: index + 1,
      }));

      service
        .searchClassesAllPages({
          terms: ['2241::FA24'],
          campuses: ['ATHN'],
        })
        .subscribe({
          next: () => {
            fail('Should not succeed');
          },
          error: (error) => {
            expect(error.message).toContain('Failed to fetch page 2');
            done();
          },
        });

      const page1Request = httpMock.expectOne(
        (request) => request.url === searchEndpoint && request.params.get('page') === '1',
      );
      page1Request.flush({
        results: page1Results,
        counts: { ATHN: 75 },
      } as ClassesResponse);

      const page2Request = httpMock.expectOne(
        (request) => request.url === searchEndpoint && request.params.get('page') === '2',
      );
      page2Request.error(new ProgressEvent('Network error'));
    });
  });

  describe('constructor', () => {
    it('should throw error if endpoint is not configured', () => {
      const originalResources = environment.ohio?.resources;
      environment.ohio = { resources: {} };

      expect(() => {
        TestBed.configureTestingModule({
          providers: [
            CourseOfferingsService,
            provideHttpClient(withInterceptorsFromDi()),
            provideHttpClientTesting(),
            provideNoopAnimations(),
          ],
          imports: [AngularComponentsModule.forRoot(environment)],
        });
        TestBed.inject(CourseOfferingsService);
      }).toThrow('Course catalog endpoint not configured');

      environment.ohio.resources = originalResources || {};
    });

    it('should normalize base URL if it includes /search/query', () => {
      environment.ohio = {
        resources: { 'course-catalog': `${courseCatalogBase}/search/query` },
      };

      TestBed.configureTestingModule({
        providers: [
          CourseOfferingsService,
          provideHttpClient(withInterceptorsFromDi()),
          provideHttpClientTesting(),
          provideNoopAnimations(),
        ],
        imports: [AngularComponentsModule.forRoot(environment)],
      });

      const testService = TestBed.inject(CourseOfferingsService);
      expect(testService['searchEndpoint']).toBe(searchEndpoint);
      expect(testService['termsEndpoint']).toBe(termsEndpoint);
    });
  });
});
```

### 4. Directory Structure

Create the service directory:
```
src/app/services/course-offerings/
  ├── course-offerings.service.ts
  └── course-offerings.service.spec.ts
```

## API Endpoint Details

### GET `/data/terms`

**Response:** Array of `Term` objects
```typescript
Term[] = [
  {
    strm: '2241',        // Term code (Fall terms end in '1')
    year: 2024,
    description: 'Fall 2024',
    code: 'FA24'        // Term code used in search
  },
  // ... more terms
]
```

**Fall Term Identification:**
- Terms where `strm.endsWith('1')` OR
- Terms where `description.toLowerCase().includes('fall')`
- Terms are returned in descending order (most recent first)

### POST `/search/query`

**Query Parameters:**
- `selectedTab`: Campus code (e.g., 'ATHN')
- `page`: Page number (default: 1)
- `pageSize`: Results per page (default: 50, max typically 50)

**Request Body:**
```typescript
{
  terms: string[],              // e.g., ['2241::FA24']
  campuses: string[],           // e.g., ['ATHN']
  subjects?: string[],          // e.g., ['CS', 'MATH']
  catalogNumber?: string,       // e.g., '2400'
  level?: string,               // e.g., 'UGRD'
  status?: string[],            // e.g., ['OPEN', 'FULL']
  // ... other optional fields
}
```

**Response:**
```typescript
{
  results: ClassResult[],       // Array of class results
  counts: Record<string, number>, // e.g., { "ATHN": 1500 }
  metadata?: {
    page: number,
    campus: string,
    lastViewRefreshDate?: string
  }
}
```

**Pagination:**
- Response includes `counts` with total count per campus
- Continue fetching pages while `results.length === pageSize` AND `fetchedSoFar < totalCount`
- Use `expand` and `reduce` RxJS operators for multi-page fetching

## Key Implementation Details

### 1. Base URL Normalization

The service includes `normalizeBaseUrl()` to handle cases where the environment configuration might accidentally include `/search/query`:
- Input: `'https://ais.kube.ohio.edu/api/course-offerings/search/query'`
- Output: `'https://ais.kube.ohio.edu/api/course-offerings'`

This ensures the service always constructs endpoints correctly:
- `searchEndpoint` = `${base}/search/query`
- `termsEndpoint` = `${base}/data/terms`

### 2. Error Handling

All HTTP calls must use `catchError`:
- Terms endpoint failures throw errors with descriptive messages
- Search endpoint failures include context (page number, course identifier)
- Errors should be caught and re-thrown with meaningful messages

### 3. Pagination Logic

When fetching all pages:
- Start with page 1
- Check if `hasMore = results.length === pageSize && fetchedSoFar < totalCount`
- Use `expand` operator to recursively fetch next page if `hasMore`
- Use `reduce` operator to accumulate all results
- Return `EMPTY` when `hasMore` is false to stop pagination

### 4. Fall Term Detection

Fall terms are identified by:
1. `strm.endsWith('1')` - Fall terms have STRM codes ending in 1
2. `description.toLowerCase().includes('fall')` - Case-insensitive check

The first matching term found (terms are in descending order, most recent first) is used.

### 5. Campus Count Handling

The `counts` object is keyed by campus code:
- Prefer `counts['ATHN']` when available
- Fall back to first value in counts object if ATHN not available
- Default to 0 if counts object is empty

## Testing Requirements

All tests should:
1. Mock `HttpTestingController` for HTTP requests
2. Set up `environment.ohio.resources['course-catalog']` in `beforeEach`
3. Mock `NotificationService.catchAndDisplay` if used
4. Test both success and error cases
5. Verify request bodies and query parameters
6. Test pagination logic thoroughly
7. Use `done()` callback for async tests
8. Call `httpMock.verify()` in `afterEach` to ensure no outstanding requests

## Integration Checklist

- [ ] Add `course-catalog` to `environment.js.jinja2`
- [ ] Create `src/app/services/course-offerings/` directory
- [ ] Create `course-offerings.service.ts` with all methods
- [ ] Create `course-offerings.service.spec.ts` with comprehensive tests
- [ ] Ensure all HTTP calls have `catchError` handlers
- [ ] Verify no console.X methods are used
- [ ] Run tests and ensure all pass
- [ ] Verify error messages include identifiers (course subject/catalog, term info)

## Usage Example (for reference, not part of this branch)

Once this service is integrated, it can be used in future branches like this:

```typescript
// Get current Fall term
this.courseOfferingsService.getCurrentFallTerm().subscribe({
  next: ({ termCode, term }) => {
    console.log(`Current Fall term: ${term.description} (${term.year})`);
  }
});

// Search for classes (single page)
this.courseOfferingsService.searchClasses({
  terms: ['2241::FA24'],
  campuses: ['ATHN'],
  subjects: ['CS'],
  catalogNumber: '2400'
}).subscribe({
  next: (response) => {
    console.log(`Found ${response.counts.ATHN} classes`);
  }
});

// Search for all classes across all pages
this.courseOfferingsService.searchClassesAllPages(
  {
    terms: ['2241::FA24'],
    campuses: ['ATHN'],
    subjects: ['CS'],
    catalogNumber: '2400'
  },
  (classResult) => classResult.subject === 'CS' && classResult.catalogNumber === '2400'
).subscribe({
  next: (allClasses) => {
    console.log(`Total classes found: ${allClasses.length}`);
  }
});
```

## Notes for Second Branch (UI Integration)

When creating the UI branch that uses this service:
- The service will be available at `CourseOfferingsService`
- All interfaces (`ClassResult`, `Term`, `ClassesResponse`) will be exported
- The service methods are designed to be reusable for various search scenarios
- The UI can compose higher-level methods (like `checkCourseExists`) on top of these base methods

## Common Issues and Solutions

### Issue: CORS errors when calling endpoints
**Solution:** Ensure the environment is pointing to the correct server. The service uses the base URL from environment configuration.

### Issue: Endpoint includes `/search/query` in base URL
**Solution:** The `normalizeBaseUrl()` method automatically handles this, stripping `/search/query` if present.

### Issue: Pagination doesn't fetch all pages
**Solution:** Verify the `hasMore` logic:
- `hasMore = response.results.length === pageSize && fetchedSoFar < totalCount`
- Ensure `totalCount` is correctly extracted from `response.counts`

### Issue: Fall term not found
**Solution:** Verify terms array contains at least one term where `strm.endsWith('1')` or description contains "fall". Check API response structure matches `Term[]` interface.

## Files Summary

**Modified:**
- `src/environment.js.jinja2` - Add `course-catalog` resource

**Created:**
- `src/app/services/course-offerings/course-offerings.service.ts`
- `src/app/services/course-offerings/course-offerings.service.spec.ts`

**Not Included (for second branch):**
- Component files
- Routes
- UI templates
- Component tests
- Navigation menu items

