# LCFA Course Search

A React frontend application for searching and managing courses using the Course Offerings API.

## Features

- Search for courses by subject and catalog number (e.g., "MATH 1500" or "CS 2400")
- Add up to 4 courses to your course list
- Store all available classes for each course (for future schedule generation)
- Clean, modern UI with responsive design

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_COURSE_CATALOG_BASE_URL=https://ais.kube.ohio.edu/api/course-offerings
```

**Important:** Do not include `/search/query` or `/data/terms` in the URL - the service will add those endpoints automatically.

### 3. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

## Usage

1. Enter a course code in the search box (e.g., "MATH 1500" or "CS 2400")
2. Click "Add Course" or press Enter
3. The course will be added to your list below
4. You can add up to 4 courses
5. Click the × button to remove a course from your list

## Project Structure

```
src/
  ├── components/
  │   ├── CourseSearch.tsx    # Search input component
  │   └── CourseList.tsx       # Display added courses
  ├── services/
  │   └── course-offerings.service.ts  # API service functions
  ├── types/
  │   └── course-offerings.ts  # TypeScript interfaces
  ├── config/
  │   └── environment.ts       # Environment configuration
  ├── App.tsx                  # Main app component
  ├── App.css                  # App styles
  ├── main.tsx                 # Entry point
  └── index.css                # Global styles
```

## API Integration

The app uses the Course Offerings API endpoints:
- `GET /data/terms` - Fetch available terms
- `POST /search/query` - Search for classes

The service automatically:
- Fetches the current Fall term
- Searches for all matching classes across all pages
- Filters results to match exact subject and catalog number

## Notes

- Classes are stored in the course object but not displayed in the UI (they will be used for schedule generation later)
- Each course shows the number of available classes
- The app supports searching with or without spaces (e.g., "MATH 1500" or "MATH1500")

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

