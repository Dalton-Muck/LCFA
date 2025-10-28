#!/usr/bin/env python3
"""
Course Offerings Data Fetcher

This script pulls course offerings data from an external API and stores it
in JSON format for use with LLMs or other applications.
"""

import os
import json
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
import requests
from dotenv import load_dotenv


class CourseCatalogFetcher:
    """Fetches and stores course offerings from an API."""
    
    def __init__(self, api_url: str, storage_file: str = "data/courses.json"):
        """
        Initialize the fetcher.
        
        Args:
            api_url: The base URL of the course catalog API
            storage_file: Path to JSON file for storing data
        """
        self.api_url = api_url
        self.storage_file = storage_file
        self.ensure_data_directory()
        
    def ensure_data_directory(self):
        """Create data directory if it doesn't exist."""
        os.makedirs(os.path.dirname(self.storage_file) or '.', exist_ok=True)
    
    def fetch_page(self, page: int, page_size: int = 50, **filters) -> Dict[str, Any]:
        """
        Fetch a single page of course data from the API.
        
        Args:
            page: Page number to fetch
            page_size: Number of results per page
            **filters: Additional filter parameters
        
        Returns:
            Dict containing results and counts
        """
        # Default request body
        payload = {
            "terms": filters.get("terms", ["2251::FALL", "2257::SUMMER1", "2257::SUMMER2", "2257::SUMMERFULL", "2255::SPRING"]),
            "campuses": filters.get("campuses", ["ATHN"]),
            "program": filters.get("program", ""),
            "subjects": filters.get("subjects", []),
            "catalogNumber": filters.get("catalogNumber", ""),
            "name": filters.get("name", ""),
            "topic": filters.get("topic", ""),
            "level": filters.get("level", "UGRD"),
            "status": filters.get("status", ["OPEN", "WAITLIST", "MAJORS", "PERMISSION", "FULL"]),
            "generalEducationTier1": filters.get("generalEducationTier1", []),
            "generalEducationTier2": filters.get("generalEducationTier2", []),
            "generalEducationTier3": filters.get("generalEducationTier3", []),
            "themes": filters.get("themes", []),
            "bricks": filters.get("bricks", []),
            "isSync": True,
            "isAsync": True,
            "instructors": filters.get("instructors", []),
            "description": filters.get("description", ""),
            "offeredInPerson": True,
            "offeredOnline": True,
            "startTime": filters.get("startTime", ""),
            "endTime": filters.get("endTime", ""),
            "days": filters.get("days", []),
            "eligibleGrades": filters.get("eligibleGrades", ""),
            "building": filters.get("building", []),
        }
        
        # Merge any additional filters
        for key, value in filters.items():
            if key not in payload:
                payload[key] = value
        
        # Query parameters
        params = {
            "selectedTab": "ATHN",
            "page": page,
            "pageSize": page_size,
        }
        
        try:
            response = requests.post(
                self.api_url,
                params=params,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page}: {e}")
            raise
    
    def fetch_all_courses(self, page_size: int = 50, delay: float = 0.5, **filters) -> List[Dict[str, Any]]:
        """
        Fetch all course offerings with pagination.
        
        Args:
            page_size: Number of results per page
            delay: Delay between requests in seconds
            **filters: Filter parameters
        
        Returns:
            List of all course dictionaries
        """
        all_courses = []
        total_count = 0
        rolling_count = 0
        page = 1
        
        print(f"Starting course fetch from {self.api_url}")
        print("-" * 60)
        
        while True:
            try:
                # Fetch page
                data = self.fetch_page(page, page_size, **filters)
                
                # Update counts
                total_count = sum(data.get("counts", {}).values())
                rolling_count += len(data.get("results", []))
                
                # Add results
                all_courses.extend(data.get("results", []))
                
                # Progress update
                print(f"Page {page}: Fetched {len(data.get('results', []))} courses "
                      f"(Total: {rolling_count}/{total_count})")
                
                # Check if done
                if rolling_count >= total_count or not data.get("results"):
                    break
                
                page += 1
                
                # Add delay to avoid rate limiting
                if delay > 0:
                    time.sleep(delay)
                    
            except Exception as e:
                print(f"Error on page {page}: {e}")
                break
        
        print("-" * 60)
        print(f"Fetch complete! Total pages: {page}, Total courses: {len(all_courses)}")
        
        return all_courses
    
    def save_to_json(self, courses: List[Dict[str, Any]], metadata: Optional[Dict] = None):
        """
        Save courses to JSON file.
        
        Args:
            courses: List of course dictionaries
            metadata: Optional metadata to include
        """
        data = {
            "metadata": metadata or {},
            "courses": courses,
            "fetched_at": datetime.now().isoformat(),
            "total_courses": len(courses),
        }
        
        with open(self.storage_file, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"Data saved to {self.storage_file}")
    
    def load_from_json(self) -> Dict[str, Any]:
        """Load courses from JSON file."""
        if not os.path.exists(self.storage_file):
            return {"courses": [], "metadata": {}, "total_courses": 0}
        
        with open(self.storage_file, 'r') as f:
            return json.load(f)
    
    def print_summary(self, courses: List[Dict[str, Any]], limit: int = 10):
        """
        Print a summary of courses to terminal.
        
        Args:
            courses: List of course dictionaries
            limit: Number of courses to print
        """
        print("\n" + "=" * 80)
        print("COURSE OFFERINGS SUMMARY")
        print("=" * 80)
        
        for i, course in enumerate(courses[:limit]):
            print(f"\n{i+1}. {course.get('subject', '')} {course.get('catalogNumber', '')}")
            print(f"   Title: {course.get('title', 'N/A')}")
            print(f"   Credits: {course.get('minCreditHours', 'N/A')}")
            if course.get('requisite'):
                print(f"   Prerequisites: {course.get('requisite', '')}")
            if course.get('department'):
                print(f"   Department: {course.get('department', '')}")
        
        if len(courses) > limit:
            print(f"\n... and {len(courses) - limit} more courses")
        
        print("=" * 80)
    
    def get_course_by_code(self, subject: str, catalog_number: str, 
                           courses: Optional[List[Dict]] = None) -> Optional[Dict]:
        """
        Get a specific course by subject and catalog number.
        
        Args:
            subject: Course subject code
            catalog_number: Course catalog number
            courses: Optional pre-loaded courses list
        
        Returns:
            Course dictionary or None if not found
        """
        if courses is None:
            data = self.load_from_json()
            courses = data.get("courses", [])
        
        for course in courses:
            if (course.get("subject") == subject and 
                course.get("catalogNumber") == catalog_number):
                return course
        
        return None
    
    def search_courses(self, query: str, courses: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Search courses by title or description.
        
        Args:
            query: Search query
            courses: Optional pre-loaded courses list
        
        Returns:
            List of matching courses
        """
        if courses is None:
            data = self.load_from_json()
            courses = data.get("courses", [])
        
        query_lower = query.lower()
        matches = []
        
        for course in courses:
            title = course.get("title", "").lower()
            desc = course.get("description", "").lower()
            
            if query_lower in title or query_lower in desc:
                matches.append(course)
        
        return matches


def main():
    """Main function to fetch and store course data."""
    # Load environment variables
    load_dotenv()
    
    api_url = os.getenv("COURSE_CATALOG_URL")
    
    if not api_url:
        print("Error: COURSE_CATALOG_URL not set in environment variables")
        print("Please set it in a .env file or as an environment variable")
        print("Example: COURSE_CATALOG_URL=https://api.example.com/course-search")
        return
    
    # Initialize fetcher
    fetcher = CourseCatalogFetcher(api_url, storage_file="data/courses.json")
    
    # Check if we have existing data
    if os.path.exists(fetcher.storage_file):
        print(f"Found existing data at {fetcher.storage_file}")
        response = input("Fetch new data? (y/n): ").lower()
        if response != 'y':
            print("Loading existing data...")
            data = fetcher.load_from_json()
            courses = data.get("courses", [])
            fetcher.print_summary(courses)
            return
    
    # Fetch all courses
    print("\nFetching course offerings...")
    courses = fetcher.fetch_all_courses(delay=0.5)
    
    # Save to JSON
    fetcher.save_to_json(courses, metadata={
        "api_url": api_url,
        "fetched_by": "fetch_courses.py",
    })
    
    # Print summary
    fetcher.print_summary(courses)


if __name__ == "__main__":
    main()

